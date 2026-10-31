// ▶ FE 16번에 해당하는 부분: T-1 할 일 목록 — 종류 필터(장학·졸업·학적, 일반 할 일은 '전체'에서만), D-day 순
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Pressable, Text } from '../../../components/Text';
import { Badge, Card, Chips, DdayBadge, Row, Screen, StateView, Sub } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import { TODO_TYPE_KO, type Todo, type TodoType } from '../../../lib/types';

const FILTERS: (Exclude<TodoType, 'deadline'> | null)[] = [null, 'scholarship', 'graduation', 'status'];

export default function TodoList() {
  const [type, setType] = useState<Exclude<TodoType, 'deadline'> | null>(null);
  const { data, error, loading, reload } = useApi<Todo[]>(`/todos?done=false${type ? `&type=${type}` : ''}`);
  // 서버가 D-day 순으로 주지만, 예시 데이터·직접 등록한 일까지 한 번 더 정렬 (마감 없는 일은 맨 뒤)
  const list = [...(data ?? [])].sort((a, b) => (a.d_day ?? 999) - (b.d_day ?? 999));

  return (
    <Screen title="할 일">
      <Chips items={FILTERS} value={type} onChange={setType} label={(v) => (v ? TODO_TYPE_KO[v] : '전체')} />
      <StateView loading={loading} error={error} empty={!list.length} emptyText="챙길 일이 없어요" onRetry={reload}>
        {list.map((t) => (
          <Card key={t.id} onPress={() => router.push(`/todos/${t.id}`)}>
            <Row>
              <DdayBadge dDay={t.d_day} type={t.type} />
              {t.type !== 'deadline' && <Badge label={TODO_TYPE_KO[t.type]} tone="soft" />}
              <View style={{ flex: 1 }} />
              <Feather name="chevron-right" size={18} color={color.inkSub} />
            </Row>
            <Text style={{ fontSize: 15, fontWeight: '700', color: color.ink }}>{t.title}</Text>
            {t.due_date && <Sub>마감 {t.due_date}</Sub>}
          </Card>
        ))}
      </StateView>
      {/* ▶ FE 18번에 해당하는 부분: T-3 완료 기록으로 가는 길 */}
      <Pressable onPress={() => router.push('/todos/done')}><Sub style={{ color: color.primary, fontWeight: '700' }}>완료한 일 보기 ›</Sub></Pressable>
    </Screen>
  );
}
