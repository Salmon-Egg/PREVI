// 시안 10 성적 수정 모드: 과목 삭제(−), 학기별 + 과목 추가하기, 수정 완료하기
import { Stack } from 'expo-router';

import { GradesView } from '../../../components/GradesView';
import { Screen } from '../../../components/ui';

export default function GradesEdit() {
  return (
    <Screen>
      <Stack.Screen options={{ title: '성적 수정 모드' }} />
      <GradesView editing />
    </Screen>
  );
}
