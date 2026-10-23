// M-3 마이페이지: 프로필, 학적 변경, AI 비서 설정, 로그아웃, 계정 삭제
import { router, Stack } from 'expo-router';

import { Body, Button, Card, confirmAsk, Screen, StateView, Sub, Title } from '../../../components/ui';
import { api, useApi } from '../../../lib/api';
import { logout } from '../../../lib/session';
import { STATUS_KO, type Me } from '../../../lib/types';

export default function MyPage() {
  const { data: me, error, loading, reload } = useApi<Me>('/me');

  function deleteAccount() {
    confirmAsk('계정 삭제', '성적을 포함한 모든 정보가 지워지고 되돌릴 수 없어요.', '삭제', async () => {
      await api.del('/me');
      await logout();
    });
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: '마이페이지' }} />
      <StateView loading={loading} error={error} empty={!me} onRetry={reload}>
        {me && (
          <Card>
            <Title>{me.nickname || '학생'}</Title>
            <Sub>{me.department} {me.grade}학년 {me.semester}학기 · {STATUS_KO[me.status]}</Sub>
            {me.minor && <Sub>부전공 {me.minor}</Sub>}
          </Card>
        )}
        <Card onPress={() => router.push('/me/status')}><Body>학적 정보 변경 ›</Body></Card>
        <Card onPress={() => router.push('/me/assistant')}><Body>AI 비서 설정 · 알림 ›</Body></Card>
        <Card onPress={() => router.push('/scholarships/applications')}><Body>장학 신청 내역 ›</Body></Card>
        <Card onPress={() => router.push('/todos/done')}><Body>완료한 일 ›</Body></Card>
        <Button label="로그아웃" kind="ghost" onPress={logout} />
        <Button label="계정 삭제" kind="ghost" onPress={deleteAccount} />
      </StateView>
    </Screen>
  );
}
