// ▶ FE 30번·31번·32번·33번에 해당하는 부분: 채팅 화면 (본문은 components/ChatPanel.tsx)
// 다른 화면에서 넘어올 때: q(바로 보낼 질문), contextKind·contextId(할 일·공지·학적 맥락), conversation(이전 대화 — 대화 목록·'답변 도착' 푸시)
// 홈에서는 이 화면으로 가지 않고, 아래 질문창을 끌어 올리면 같은 대화 본문이 홈 위로 올라옴 (FE 15번)
import { Feather } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatPanel } from '../../../components/ChatPanel';
import { Text } from '../../../components/Text';
import { goBack } from '../../../components/ui';
import { color } from '../../../lib/theme';

export default function Chat() {
  const p = useLocalSearchParams<{ q?: string; contextKind?: 'todo' | 'notice' | 'status'; contextId?: string; conversation?: string }>();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: color.homeBg }}>
      <Stack.Screen options={{ title: 'PREVI' }} />
      {/* 머리줄: 홈 대화창(ChatSheet)을 펼쳤을 때와 같은 모양 */}
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityLabel="뒤로" hitSlop={8} onPress={goBack} style={st.btn}>
          <Feather name="chevron-left" size={26} color={color.ink} />
        </Pressable>
        <Text style={st.title}>PREVI</Text>
        <Pressable accessibilityLabel="대화 기록" hitSlop={8} onPress={() => router.push('/chat/history')} style={st.btn}>
          <Feather name="clock" size={21} color={color.ink} />
        </Pressable>
      </View>
      <ChatPanel q={p.q} conversation={p.conversation} keyboardOffset={insets.top + 52}
        context={p.contextKind && p.contextId ? { kind: p.contextKind, id: Number(p.contextId) } : null} />
    </View>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingBottom: 8 },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: color.primary },
});
