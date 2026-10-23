// S-3 장학 신청 내역
import { router, Stack } from 'expo-router';

import { Body, Card, Screen, StateView, Sub } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import type { Application } from '../../../lib/types';

export default function Applications() {
  const { data, error, loading, reload } = useApi<Application[]>('/scholarship-applications');
  return (
    <Screen>
      <Stack.Screen options={{ title: '신청 내역' }} />
      <StateView loading={loading} error={error} empty={!data?.length} emptyText="신청 완료로 체크한 장학금이 없어요" onRetry={reload}>
        {data?.map((a) => (
          <Card key={a.notice_id} onPress={() => router.push(`/notices/${a.notice_id}`)}>
            <Body style={{ fontWeight: '700' }}>{a.title}</Body>
            <Sub>{a.applied_at.slice(0, 10)} 신청 완료</Sub>
          </Card>
        ))}
      </StateView>
    </Screen>
  );
}
