// ▶ FE 30번·31번·32번·33번에 해당하는 부분: 채팅 화면 (본문은 components/ChatPanel.tsx)
// 다른 화면에서 넘어올 때: q(바로 보낼 질문), contextKind·contextId(할 일·공지·학적 맥락), conversation(이전 대화 — 대화 목록·'답변 도착' 푸시)
// 홈에서는 이 화면으로 가지 않고, 아래 질문창을 끌어 올리면 같은 대화 본문이 홈 위로 올라옴 (FE 15번)
import { Feather } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable } from 'react-native';

import { ChatPanel } from '../../../components/ChatPanel';
import { color } from '../../../lib/theme';

export default function Chat() {
  const p = useLocalSearchParams<{ q?: string; contextKind?: 'todo' | 'notice' | 'status'; contextId?: string; conversation?: string }>();
  return (
    <>
      <Stack.Screen options={{
        title: '서경 AI',
        headerStyle: { backgroundColor: color.homeBg },
        headerRight: () => (
          <Pressable accessibilityLabel="대화 기록" onPress={() => router.push('/chat/history')} style={{ padding: 4 }}>
            <Feather name="clock" size={22} color={color.ink} />
          </Pressable>
        ),
      }} />
      <ChatPanel q={p.q} conversation={p.conversation}
        context={p.contextKind && p.contextId ? { kind: p.contextKind, id: Number(p.contextId) } : null} />
    </>
  );
}
