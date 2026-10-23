// T-1 할 일 목록: 종류 필터, D-day 순
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, DdayBadge, Row, Screen, StateView, Sub } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import type { Todo, TodoType } from '../../../lib/types';

const FILTERS: { key: TodoType | null; label: string }[] = [
  { key: null, label: '전체' },
  { key: 'deadline', label: '마감' },
  { key: 'scholarship', label: '장학' },
  { key: 'graduation', label: '졸업' },
  { key: 'status', label: '학적' },
];

export default function TodoList() {
  const [type, setType] = useState<TodoType | null>(null);
  const { data, error, loading, reload } = useApi<Todo[]>(`/todos?done=false${type ? `&type=${type}` : ''}`);

  return (
    <Screen>
      <Stack.Screen options={{ title: '할 일' }} />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <Pressable key={f.label} onPress={() => setType(f.key)}
            style={{ borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: f.key === type ? color.primary : color.surface }}>
            <Text style={{ color: f.key === type ? '#fff' : color.ink, fontWeight: '600' }}>{f.label}</Text>
          </Pressable>
        ))}
      </View>
      <StateView loading={loading} error={error} empty={!data?.length} emptyText="챙길 일이 없어요" onRetry={reload}>
        {data?.map((t) => (
          <Card key={t.id} onPress={() => router.push(`/todos/${t.id}`)}>
            <Row>
              <DdayBadge dDay={t.d_day} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: color.ink }}>{t.title}</Text>
            </Row>
            {t.due_date && <Sub>마감 {t.due_date}</Sub>}
          </Card>
        ))}
      </StateView>
      <Pressable onPress={() => router.push('/todos/done')}><Sub>완료한 일 보기 ›</Sub></Pressable>
    </Screen>
  );
}
