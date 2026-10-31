// AI 대화 본문. 모든 화면 위에 있는 끌어 올리는 대화창(ChatSheet, FE 15번) 안에 들어감
// ▶ FE 30번에 해당하는 부분: H-1 채팅 시작 (마스코트 PREVI + 추천 질문, 피그마 06_ai_chat ①)
// ▶ FE 31번에 해당하는 부분: H-2 답변 — 말풍선, 답변 카드(졸업 요건·공지 요약), 출처, 다음 행동 버튼, '답변 작성 중' (시안 ②)
// ▶ FE 32번에 해당하는 부분: 다른 화면에서 맥락(할 일·공지·학적)과 함께 묻기 → lib/chatStore.ts askChat
// ▶ FE 33번에 해당하는 부분: '답변 도착' 푸시(type=chat)를 누르면 그 대화를 불러와 대화창이 열림 (lib/push.ts)
import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pressable, Text, TextInput } from './Text';
import { Character, InfoCard, openLink, showAlert, Sources, TypingDots } from './ui';
import { api, ApiError } from '../lib/api';
import { closeChatSheet, sendChat, useChat } from '../lib/chatStore';
import { color } from '../lib/theme';
import type { ChatAction, Message } from '../lib/types';

// 시안 ①의 추천 질문 (아이콘 + 질문)
const STARTERS: { icon: keyof typeof Feather.glyphMap; q: string }[] = [
  { icon: 'award', q: '졸업까지 뭐가 남았어?' },
  { icon: 'dollar-sign', q: '내가 받을 수 있는 장학금 있어?' },
  { icon: 'calendar', q: '이번 주 학사 일정 알려줘' },
  { icon: 'refresh-cw', q: '휴학하면 장학금은 어떻게 돼?' },
];

/** 답변 버튼의 화면 번호 → 앱 주소 (메뉴구성.md 화면 번호) */
const SCREENS: Record<string, (id?: number) => Href> = {
  'L-1': () => '/study',
  'L-2': () => '/study/graduation',
  'L-3': () => '/study/timetable',
  'L-8': () => '/study/grades',
  'T-1': () => '/todos',
  'T-2': (id) => `/todos/${id}`,
  'S-1': () => '/scholarships',
  'S-2': (id) => `/notices/${id}`,
  'S-3': () => '/scholarships/applications',
  'A-1': () => '/office',
  'A-2': () => '/office/calendar',
  'A-3': () => '/office/leave',
};

/** 서버가 빈 칸(cards·sources·actions)을 빼고 줘도 그리다 멈추지 않게 */
const filled = (m: Message): Message => ({ ...m, cards: m.cards ?? [], sources: m.sources ?? [], actions: m.actions ?? [] });

/** 답변: 첫 문장(결론)은 굵게, "· " 줄은 요점 목록, 여러 질문의 ①②③ 줄은 소제목. 서버 형식은 글자 그대로라 예전 대화도 같이 보임 */
function AnswerText({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => l.trim());
  const multi = /^[①②③]/.test(lines[0] ?? '');
  const first = multi ? null : lines[0]?.match(/^(.+?[.!?])\s+(.+)$/); // "3.5"의 점은 뒤에 빈칸이 없어 안 걸림
  const rows = first ? [first[1], first[2], ...lines.slice(1)] : lines;
  return (
    <View style={{ gap: 4 }}>
      {rows.map((l, i) => l.startsWith('· ') ? (
        <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
          <Text style={st.answer}>·</Text>
          <Text style={[st.answer, { flex: 1 }]}>{l.slice(2)}</Text>
        </View>
      ) : (
        <Text key={i} style={[st.answer, (multi ? /^[①②③]/.test(l) : i === 0) && { fontWeight: '700' }]}>{l}</Text>
      ))}
    </View>
  );
}

/** keyboardOffset: 위에 머리줄이 있으면 그 높이 (iOS 키보드가 입력창을 가리지 않게).
 *  대화 내용은 lib/chatStore.ts에 있어서, 답을 기다리다 창을 내렸다 올려도 그대로 보임 */
export function ChatPanel({ keyboardOffset = 90 }: { keyboardOffset?: number }) {
  const { messages, waiting } = useChat();
  const insets = useSafeAreaInsets(); // 대화창은 화면 맨 아래까지 → 입력창이 안드로이드 하단 바에 가리지 않게
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<Record<number, 'up' | 'down'>>({});
  const [added, setAdded] = useState<Set<string>>(() => new Set()); // 이미 할 일로 등록한 버튼 (두 번 눌러 같은 할 일이 두 번 생기지 않게)
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  function send(question: string) {
    setText('');
    sendChat(question);
  }

  async function act(a: ChatAction, key: string) {
    if (a.type === 'add_todo') {
      if (added.has(key)) return;
      setAdded((s) => new Set(s).add(key));
      try {
        // 서버(POST /todos)는 source로 공지(notice)만 받아서, 채팅에서 만든 할 일은 source 없이 보냄
        await api.post('/todos', { ...a.payload, type: 'deadline' });
        const due = a.payload.due_date ? ` (${a.payload.due_date.slice(5).replace('-', '/')}까지)` : '';
        showAlert('할 일에 등록했어요', `'${a.payload.title}'${due}\n마감 전날과 당일에 알려 드릴게요.`);
      } catch (e) {
        setAdded((s) => {
          const next = new Set(s);
          next.delete(key);
          return next;
        });
        showAlert('할 일에 등록하지 못했어요', (e as ApiError).message);
      }
    } else if (a.type === 'open_link') {
      openLink(a.payload.url);
    } else if (a.type === 'ask') {
      send(a.payload.text); // 비서가 되물은 질문 중 고른 것을 그대로 보냄
    } else {
      const to = SCREENS[a.payload.screen];
      if (!to) return;
      closeChatSheet(); // 대화창을 내리고 그 화면으로
      router.push(to(a.payload.id));
    }
  }

  // 👍👎: 서버에 저장 → 관리자 웹 '아쉬워요'. 저장 실패면 표시를 되돌림
  function rate(id: number, v: 'up' | 'down') {
    const before = feedback[id];
    setFeedback((f) => ({ ...f, [id]: v }));
    api.patch(`/messages/${id}/feedback`, { feedback: v }).catch(() => setFeedback((f) => ({ ...f, [id]: before! })));
  }

  const time = (iso: string) => (iso ? new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' }) : '');

  return (
    // 안드로이드도 padding: Expo SDK 58은 화면이 하단 바·키보드 밑까지 그려져(edge-to-edge) 창이 저절로 줄지 않음 → 키보드가 입력창을 가림
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.homeBg }} behavior={Platform.OS === 'web' ? undefined : 'padding'} keyboardVerticalOffset={keyboardOffset}>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }} onContentSizeChange={() => scroll.current?.scrollToEnd()}>
        {messages.length === 0 && !waiting && (
          // H-1 시작 화면 (시안 ①)
          <View style={st.start}>
            <View>
              <Character size={160} />
              <View style={st.startBubble}><Text style={st.startBubbleText}>무엇이든{'\n'}물어보세요!</Text></View>
            </View>
            <Text style={st.startTitle}>무엇을 도와드릴까요?</Text>
            <Text style={st.startSub}>수업, 장학금, 졸업, 캠퍼스 생활까지{'\n'}프리비가 학교 문서를 근거로 도와드려요.{'\n'}AI 답변은 틀릴 수 있으니 중요한 내용은 학교 공지로 확인해 주세요.</Text>
            <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 8 }}>
              {STARTERS.map((s) => (
                <Pressable key={s.q} style={st.starter} onPress={() => send(s.q)}>
                  <View style={st.starterIcon}><Feather name={s.icon} size={16} color={color.primary} /></View>
                  <Text style={st.starterText}>{s.q}</Text>
                  <Feather name="chevron-right" size={18} color={color.inkSub} />
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {messages.map(filled).map((m) =>
          m.role === 'user' ? (
            <View key={m.id} style={{ alignItems: 'flex-end', gap: 2 }}>
              <View style={[st.bubble, st.mine]}><Text style={{ color: color.ink, fontSize: 15 }}>{m.text}</Text></View>
              <Text style={st.time}>{time(m.created_at)}</Text>
            </View>
          ) : (
            <View key={m.id} style={{ gap: 8 }}>
              <View style={st.aiRow}>
                <View style={st.avatar}><Character face size={34} /></View>
                <View style={[st.bubble, st.ai]}><AnswerText text={m.text} /></View>
              </View>
              {m.cards.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingLeft: 42 }}>
                  {m.cards.map((c, i) => <InfoCard key={i} card={c} />)}
                </ScrollView>
              )}
              <View style={{ paddingLeft: 42, gap: 8 }}>
                <Sources items={m.sources} />
                {m.actions.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {m.actions.map((a) => {
                      const key = `${m.id}:${a.label}`;
                      const done = added.has(key);
                      return (
                        <Pressable key={a.label} style={[st.action, a === m.actions[0] && st.actionMain, done && { opacity: 0.5 }]} disabled={done} onPress={() => act(a, key)}>
                          <Text style={{ color: a === m.actions[0] ? '#fff' : color.primary, fontWeight: '700' }}>{done ? '✓ 할 일에 등록됨' : a.type === 'add_todo' ? `${a.label} · ${a.payload.title}` : a.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                  {(['up', 'down'] as const).map((v) => (
                    <Pressable key={v} accessibilityLabel={v === 'up' ? '도움이 됐어요' : '도움이 안 됐어요'} onPress={() => rate(m.id, v)}>
                      <Feather name={v === 'up' ? 'thumbs-up' : 'thumbs-down'} size={16} color={feedback[m.id] === v ? color.primary : color.inkSub} />
                    </Pressable>
                  ))}
                  {feedback[m.id] && <Text style={st.time}>의견 고마워요</Text>}
                </View>
              </View>
            </View>
          ),
        )}
        {waiting && (
          <View style={st.aiRow}>
            <View style={st.avatar}><Character face size={34} /></View>
            <View style={[st.bubble, st.ai]}><TypingDots /></View>
          </View>
        )}
      </ScrollView>
      <View style={[st.inputBar, { marginBottom: 12 + insets.bottom }]}>
        <View style={st.inputAvatar}><Character face size={36} /></View>
        <TextInput style={st.input} placeholder="무엇이든 물어보세요..." placeholderTextColor={color.inkSub} value={text}
          onChangeText={setText} onSubmitEditing={() => send(text)} returnKeyType="send" />
        <Pressable accessibilityLabel="보내기" onPress={() => send(text)} style={[st.send, (!text.trim() || waiting) && { opacity: 0.5 }]}>
          <Feather name="arrow-right" size={20} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  start: { alignItems: 'center', gap: 6, paddingTop: 8 },
  startBubble: { position: 'absolute', top: 4, right: -84, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10, transform: [{ rotate: '6deg' }] },
  startBubbleText: { fontSize: 12, color: color.primary, fontWeight: '700', textAlign: 'center' },
  startTitle: { fontSize: 24, fontWeight: '800', color: color.ink, marginTop: 4 },
  startSub: { fontSize: 14, color: color.inkSub, textAlign: 'center', lineHeight: 20 },
  starter: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: color.line },
  starterIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' },
  starterText: { flex: 1, fontSize: 15, color: color.ink, fontWeight: '600' },
  aiRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  avatar: { width: 34, height: 34, borderRadius: 17, overflow: 'hidden', backgroundColor: color.primarySoft },
  bubble: { borderRadius: 16, padding: 12, maxWidth: '85%' },
  mine: { backgroundColor: color.primarySoft, borderBottomRightRadius: 4 },
  ai: { backgroundColor: '#fff', borderTopLeftRadius: 4, flexShrink: 1 },
  answer: { fontSize: 15, color: color.ink, lineHeight: 22 },
  time: { fontSize: 11, color: color.inkSub },
  action: { borderWidth: 1, borderColor: color.primary, borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: '#fff' },
  actionMain: { backgroundColor: color.primary },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, padding: 6, backgroundColor: '#fff', borderRadius: 28, borderWidth: 1, borderColor: color.line },
  inputAvatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
  input: { flex: 1, fontSize: 15, paddingVertical: 8, color: color.ink },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' },
});
