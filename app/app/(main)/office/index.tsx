// A-1 나에게 해당하는 공지 (자동 수집 + AI 요약) + 학사 일정·휴복학 안내로 가는 길
import { router, Stack } from 'expo-router';
import { Text } from 'react-native';

import { Card, Row, Screen, StateView, Sub, Title } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import type { NoticeItem } from '../../../lib/types';

export default function Office() {
  const { data, error, loading, reload } = useApi<NoticeItem[]>('/notices');
  return (
    <Screen>
      <Stack.Screen options={{ title: '학사 행정' }} />
      <Row>
        <Card onPress={() => router.push('/office/calendar')} style={{ flex: 1 }}><Text style={{ fontWeight: '700' }}>학사 일정</Text></Card>
        <Card onPress={() => router.push('/office/leave')} style={{ flex: 1 }}><Text style={{ fontWeight: '700' }}>휴·복학 안내</Text></Card>
      </Row>
      <Title>나에게 해당하는 공지</Title>
      <StateView loading={loading} error={error} empty={!data?.length} emptyText="새 공지가 없어요" onRetry={reload}>
        {data?.map((n) => (
          <Card key={n.id} onPress={() => router.push(`/notices/${n.id}`)}>
            <Sub>{n.category}{n.deadline ? ` · 마감 ${n.deadline.slice(5, 10)}` : ''}</Sub>
            <Text style={{ fontSize: 15, fontWeight: '700', color: color.ink }}>{n.title}</Text>
            {n.summary[0] && <Sub>{n.summary[0]}</Sub>}
          </Card>
        ))}
      </StateView>
    </Screen>
  );
}
