// 캠퍼스 생활 (분실물 C-1~C-5 자리). 분실물은 최후순위라 아직 준비 중.
// 시안: 피그마 seokyeong_ui_06 ~ 11
import { router, Stack } from 'expo-router';

import { Body, Button, Card, Screen, Sub, Title } from '../../components/ui';

export default function Campus() {
  return (
    <Screen>
      <Stack.Screen options={{ title: '캠퍼스 생활' }} />
      <Card>
        <Title>분실물 센터는 준비 중이에요</Title>
        <Sub>사진으로 습득물을 제보하면 AI가 분실 신고와 맞춰 주인에게 알려 주는 기능을 만들고 있어요.</Sub>
      </Card>
      <Body>캠퍼스 생활이 궁금하면 서경 AI에게 물어보세요.</Body>
      <Button label="서경 AI에게 물어보기" onPress={() => router.push('/chat')} />
    </Screen>
  );
}
