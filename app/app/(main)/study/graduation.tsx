// L-2 졸업 요건 상세: 영역별 이수 현황, 남은 요건(누르면 관련 할 일)
import { router, Stack } from 'expo-router';
import { Text, View } from 'react-native';

import { Body, Card, Row, Screen, StateView, Sub, Title } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import type { Graduation } from '../../../lib/types';

export default function GraduationDetail() {
  const { data, error, loading, reload } = useApi<Graduation>('/graduation');
  return (
    <Screen>
      <Stack.Screen options={{ title: '졸업 요건' }} />
      <StateView loading={loading} error={error} empty={!data} onRetry={reload}>
        {data && (
          <>
            <Title>영역별 이수 현황</Title>
            {data.areas.map((a) => {
              const pct = Math.min(1, a.earned / a.required);
              return (
                <Card key={a.name}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Body>{a.name}</Body>
                    <Sub>{a.earned} / {a.required}학점</Sub>
                  </Row>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: color.surface }}>
                    <View style={{ width: `${pct * 100}%`, height: 8, borderRadius: 4, backgroundColor: pct >= 1 ? color.primary : color.alert }} />
                  </View>
                </Card>
              );
            })}
            <Title>남은 요건</Title>
            {data.requirements.map((r) => (
              <Card key={r.name} onPress={r.todo_id ? () => router.push(`/todos/${r.todo_id}`) : undefined}>
                <Row>
                  <Text style={{ fontSize: 18 }}>{r.done ? '✅' : '⬜'}</Text>
                  <Body style={{ flex: 1 }}>{r.name}</Body>
                  {r.todo_id && <Sub>할 일 ›</Sub>}
                </Row>
              </Card>
            ))}
          </>
        )}
      </StateView>
    </Screen>
  );
}
