// H-1 채팅 시작 / H-2 답변: 말풍선, 카드, 출처, 다음 행동 버튼, '답변 작성 중'
// 다른 화면에서 넘어올 때: q(바로 보낼 질문), contextKind·contextId(할 일·공지 맥락), conversation(이전 대화)
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { InfoCard, showAlert, Sources, Sub } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { color } from '../../../lib/theme';
import type { ChatAction, ChatReply, Message } from '../../../lib/types';

const STARTERS = ['졸업까지 뭐가 남았어?', '내가 받을 수 있는 장학금 있어?', '휴학하면 장학금은 어떻게 돼?', '복학 신청은 언제 해?'];

/** 답변 버튼의 화면 번호 → 앱 주소 (메뉴구성.md 화면 번호) */
const SCREENS: Record<string, (id?: number) => Href> = {
  'L-2': () => '/study/graduation',
  'T-1': () => '/todos',
  'T-2': (id) => `/todos/${id}`,
  'S-1': () => '/scholarships',
  'A-2': () => '/office/calendar',
  'A-3': () => '/office/leave',
};

export default function Chat() {
  const p = useLocalSearchParams<{ q?: string; contextKind?: 'todo' | 'notice'; contextId?: string; conversation?: string }>();
  const [convId, setConvId] = useState<number | null>(p.conversation ? Number(p.conversation) : null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [waiting, setWaiting] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const sentInitial = useRef(false);

  useEffect(() => {
    if (p.conversation) {
      api.get<{ messages: Message[] }>(`/conversations/${p.conversation}`).then((c) => setMessages(c.messages));
    } else if (p.q && !sentInitial.current) {
      sentInitial.current = true;
      send(p.q, p.contextKind && p.contextId ? { kind: p.contextKind, id: Number(p.contextId) } : null);
    }
  }, []);

  async function send(question: string, context: { kind: string; id: number } | null = null) {
    if (!question.trim() || waiting) return;
    setText('');
    setMessages((m) => [...m, { id: -Date.now(), role: 'user', text: question, cards: [], sources: [], actions: [], created_at: '' }]);
    setWaiting(true);
    try {
      const res = await api.post<ChatReply>('/chat', { conversation_id: convId, text: question, context });
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

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: '서경 AI', headerRight: () => <Pressable onPress={() => router.push('/chat/history')}><Text style={{ color: color.primary }}>대화 목록</Text></Pressable> }} />
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 12 }} onContentSizeChange={() => scroll.current?.scrollToEnd()}>
        {messages.length === 0 && !waiting && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: color.ink }}>무엇을 도와드릴까요?</Text>
            <Sub>학사·장학금·졸업 요건을 학교 문서를 근거로 알려 드려요.</Sub>
            {STARTERS.map((q) => (
              <Pressable key={q} style={st.starter} onPress={() => send(q)}><Text>{q}</Text></Pressable>
            ))}
          </View>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <View key={m.id} style={[st.bubble, st.mine]}><Text style={{ color: '#fff', fontSize: 15 }}>{m.text}</Text></View>
          ) : (
            <View key={m.id} style={{ gap: 8 }}>
              <View style={[st.bubble, st.ai]}><Text style={{ fontSize: 15, color: color.ink, lineHeight: 22 }}>{m.text}</Text></View>
              {m.cards.length > 0 && (
                <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
                  {m.cards.map((c, i) => <InfoCard key={i} card={c} />)}
                </ScrollView>
              )}
              <Sources items={m.sources} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {m.actions.map((a) => (
                  <Pressable key={a.label} style={st.action} onPress={() => act(a)}>
                    <Text style={{ color: color.primary, fontWeight: '600' }}>{a.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ),
        )}
        {waiting && <Sub>답변 작성 중…</Sub>}
      </ScrollView>
      <View style={st.inputBar}>
        <TextInput style={st.input} placeholder="메시지 입력" value={text} onChangeText={setText} onSubmitEditing={() => send(text)} returnKeyType="send" />
        <Pressable onPress={() => send(text)} style={st.send}><Text style={{ color: '#fff', fontWeight: '700' }}>보내기</Text></Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  starter: { backgroundColor: color.surface, borderRadius: 12, padding: 12 },
  bubble: { borderRadius: 16, padding: 12, maxWidth: '85%' },
  mine: { alignSelf: 'flex-end', backgroundColor: color.primary },
  ai: { alignSelf: 'flex-start', backgroundColor: color.surface },
  action: { borderWidth: 1, borderColor: color.primary, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  inputBar: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderColor: color.line },
  input: { flex: 1, backgroundColor: color.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15 },
  send: { backgroundColor: color.primary, borderRadius: 20, paddingHorizontal: 16, justifyContent: 'center' },
});
