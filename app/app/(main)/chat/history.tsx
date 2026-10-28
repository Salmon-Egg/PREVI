// ▶ FE 34번에 해당하는 부분: H-3 대화 목록 화면 (채팅 화면의 ⏱에서 들어옴). 홈 대화창에서는 창 안에서 열림 — 목록은 components/ChatHistory.tsx
import { router } from 'expo-router';

import { ChatHistory } from '../../../components/ChatHistory';
import { Screen } from '../../../components/ui';

export default function History() {
  return (
    <Screen title="대화 기록">
      <ChatHistory onOpen={(id) => router.push({ pathname: '/chat', params: { conversation: String(id) } })} />
    </Screen>
  );
}
