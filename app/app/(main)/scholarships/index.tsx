// S-1 나에게 맞는 장학금: 판정 + 근거
import { router, Stack } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { Card, Row, Screen, StateView, Sub, VerdictBadge } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import type { Scholarship } from '../../../lib/types';

export default function Scholarships() {
  const { data, error, loading, reload } = useApi<Scholarship[]>('/scholarships');
  return (
    <Screen>
      <Stack.Screen options={{ title: '장학금' }} />
      <StateView loading={loading} error={error} empty={!data?.length} emptyText="지금 모집 중인 장학 공지가 없어요" onRetry={reload}>
        {data?.map((s) => (
          <Card key={s.notice_id} onPress={() => router.push(`/notices/${s.notice_id}`)}>
            <Row>
              <VerdictBadge verdict={s.verdict} />
              {s.applied && <Sub>신청 완료</Sub>}
            </Row>
            <Text style={{ fontSize: 15, fontWeight: '700', color: color.ink }}>{s.title}</Text>
            {s.deadline && <Sub>마감 {s.deadline.slice(0, 16).replace('T', ' ')}</Sub>}
            {s.reasons.map((r) => <Sub key={r}>· {r}</Sub>)}
          </Card>
        ))}
      </StateView>
      <Pressable onPress={() => router.push('/scholarships/applications')}><Sub>신청 내역 보기 ›</Sub></Pressable>
    </Screen>
  );
}
