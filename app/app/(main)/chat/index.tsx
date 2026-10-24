// ▶ FE 30번에 해당하는 부분: H-1 채팅 시작 (캐릭터 + 추천 질문, 피그마 06_ai_chat ①)
// ▶ FE 31번에 해당하는 부분: H-2 답변 — 말풍선, 답변 카드(졸업 요건·공지 요약), 출처, 다음 행동 버튼, '답변 작성 중' (시안 ②)
// ▶ FE 32번에 해당하는 부분: 다른 화면에서 넘어올 때 q(바로 보낼 질문), contextKind·contextId(할 일·공지·학적 맥락)
// ▶ FE 33번에 해당하는 부분: 답을 기다리다 앱을 나가면 서버가 '답변 도착' 푸시(type=chat) → 누르면 conversation으로 이 화면이 열림
import { Feather } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Character, InfoCard, showAlert, Sources, TypingDots } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { color } from '../../../lib/theme';
import type { ChatAction, ChatReply, Message } from '../../../lib/types';

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
  'T-1': () => '/todos',
  'T-2': (id) => `/todos/${id}`,
  'S-1': () => '/scholarships',
  'S-2': (id) => `/notices/${id}`,
  'S-3': () => '/scholarships/applications',
  'A-1': () => '/office',
  'A-2': () => '/office/calendar',
  'A-3': () => '/office/leave',
  'C-1': () => '/campus',
};

type Context = { kind: string; id: number } | null;

export default function Chat() {
  const p = useLocalSearchParams<{ q?: string; contextKind?: 'todo' | 'notice' | 'status'; contextId?: string; conversation?: string }>();
  const [convId, setConvId] = useState<number | null>(p.conversation ? Number(p.conversation) : null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [feedback, setFeedback] = useState<Record<number, 'up' | 'down'>>({});
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const sentInitial = useRef(false);
  // 맥락은 첫 질문에만 붙이고, 같은 대화 안에서는 서버가 이어서 기억함
  const context: Context = p.contextKind && p.contextId ? { kind: p.contextKind, id: Number(p.contextId) } : null;

  useEffect(() => {
    if (p.conversation) {
      // 대화 목록(H-3) 또는 '답변 도착' 푸시에서 열림 → 이전 대화 불러오기
      api.get<{ messages: Message[] }>(`/conversations/${p.conversation}`).then((c) => setMessages(c.messages)).catch(() => {});
    } else if (p.q && !sentInitial.current) {
      sentInitial.current = true;
      send(p.q, context);
    }
    // 처음 열릴 때 한 번만 (넘겨받은 질문을 두 번 보내지 않게)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(question: string, ctx: Context = null) {
    if (!question.trim() || waiting) return;
    setText('');
    setMessages((m) => [...m, { id: -Date.now(), role: 'user', text: question, cards: [], sources: [], actions: [], created_at: new Date().toISOString() }]);
    setWaiting(true);
    try {
      const res = await api.post<ChatReply>('/chat', { conversation_id: convId, text: question, context: ctx });
      setConvId(res.conversation_id);
      setMessages((m) => [...m, res.message]);
    } catch (e) {
      showAlert('답변을 받지 못했어요', (e as ApiError).message);
    } finally {
      setWaiting(false);
    }
  }

  async function act(a: ChatAction) {
    if (a.type === 'add_todo') {
      await api.post('/todos', { ...a.payload, type: 'deadline', source: { kind: 'chat', id: convId } });
      showAlert('할 일에 등록했어요', '마감 전날과 당일에 알려 드릴게요.');
    } else if (a.type === 'open_link') {
      Linking.openURL(a.payload.url);
    } else {
      const to = SCREENS[a.payload.screen];
      if (to) router.push(to(a.payload.id));
    }
  }

  // 👍👎: 지금은 앱 안에서만 기록. 서버에 보내려면 API 명세에 PATCH /messages/{id} {feedback} 추가 필요(조장 확인)
  function rate(id: number, v: 'up' | 'down') {
    setFeedback((f) => ({ ...f, [id]: v }));
  }

  const time = (iso: string) => (iso ? new Date(iso).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' }) : '');

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.homeBg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{
        title: '서경 AI',
        headerStyle: { backgroundColor: color.homeBg },
        headerRight: () => (
          <Pressable accessibilityLabel="대화 기록" onPress={() => router.push('/chat/history')} style={{ padding: 4 }}>
            <Feather name="clock" size={22} color={color.ink} />
          </Pressable>
        ),
      }} />
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }} onContentSizeChange={() => scroll.current?.scrollToEnd()}>
        {messages.length === 0 && !waiting && (
          // H-1 시작 화면 (시안 ①)
          <View style={st.start}>
            <View>
              <Character size={150} />
              <View style={st.startBubble}><Text style={st.startBubbleText}>무엇이든{'\n'}물어보세요!</Text></View>
            </View>
            <Text style={st.startTitle}>무엇을 도와드릴까요?</Text>
            <Text style={st.startSub}>수업, 장학금, 졸업, 캠퍼스 생활까지{'\n'}서경 AI가 학교 문서를 근거로 도와드려요.</Text>
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
        {messages.map((m) =>
          m.role === 'user' ? (
            <View key={m.id} style={{ alignItems: 'flex-end', gap: 2 }}>
              <View style={[st.bubble, st.mine]}><Text style={{ color: color.ink, fontSize: 15 }}>{m.text}</Text></View>
              <Text style={st.time}>{time(m.created_at)}</Text>
            </View>
          ) : (
            <View key={m.id} style={{ gap: 8 }}>
              <View style={st.aiRow}>
                <View style={st.avatar}><Character face size={34} /></View>
                <View style={[st.bubble, st.ai]}><Text style={{ fontSize: 15, color: color.ink, lineHeight: 22 }}>{m.text}</Text></View>
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
                    {m.actions.map((a) => (
                      <Pressable key={a.label} style={[st.action, a === m.actions[0] && st.actionMain]} onPress={() => act(a)}>
                        <Text style={{ color: a === m.actions[0] ? '#fff' : color.primary, fontWeight: '700' }}>{a.label}</Text>
                      </Pressable>
                    ))}
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
      <View style={st.inputBar}>
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
  startBubble: { position: 'absolute', top: -6, right: -62, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10, transform: [{ rotate: '6deg' }] },
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
  time: { fontSize: 11, color: color.inkSub },
  action: { borderWidth: 1, borderColor: color.primary, borderRadius: 16, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: '#fff' },
  actionMain: { backgroundColor: color.primary },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, padding: 6, backgroundColor: '#fff', borderRadius: 28, borderWidth: 1, borderColor: color.line },
  inputAvatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden' },
  input: { flex: 1, fontSize: 15, paddingVertical: 8, color: color.ink },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' },
});
