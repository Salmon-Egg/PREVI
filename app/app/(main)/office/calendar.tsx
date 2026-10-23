// A-2 학사 일정 (내 학년에 해당하는 일정)
import { Stack } from 'expo-router';
import { Text } from 'react-native';

import { Badge, Card, Row, Screen, StateView, Sub } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import type { CalendarEvent } from '../../../lib/types';

export default function Calendar() {
  const { data, error, loading, reload } = useApi<CalendarEvent[]>('/calendar');
  return (
    <Screen>
      <Stack.Screen options={{ title: '학사 일정' }} />
      <StateView loading={loading} error={error} empty={!data?.length} emptyText="일정이 없어요" onRetry={reload}>
        {data?.map((e) => (
          <Card key={e.id} style={e.d_day < 0 ? { opacity: 0.5 } : undefined}>
            <Row>
              <Badge label={e.d_day < 0 ? '지남' : e.d_day === 0 ? '오늘' : `D-${e.d_day}`} tone={e.d_day >= 0 && e.d_day <= 3 ? 'strong' : 'soft'} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: color.ink }}>{e.title}</Text>
            </Row>
            <Sub>{e.start_date}{e.end_date && e.end_date !== e.start_date ? ` ~ ${e.end_date}` : ''}{e.description ? ` · ${e.description}` : ''}</Sub>
          </Card>
        ))}
      </StateView>
    </Screen>
  );
}
