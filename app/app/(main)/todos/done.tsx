// ▶ FE 18번에 해당하는 부분: T-3 완료 기록
// T-3 완료 기록
import { router } from 'expo-router';

import { Text } from '../../../components/Text';
import { Card, Screen, StateView, Sub } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import type { Todo } from '../../../lib/types';

export default function DoneTodos() {
  const { data, error, loading, reload } = useApi<Todo[]>('/todos?done=true');
  return (
    <Screen title="완료한 일">
      <StateView loading={loading} error={error} empty={!data?.length} emptyText="아직 완료한 일이 없어요" onRetry={reload}>
        {data?.map((t) => (
          <Card key={t.id} onPress={() => router.push(`/todos/${t.id}`)}>
            <Text style={{ fontSize: 15, color: color.inkSub, textDecorationLine: 'line-through' }}>{t.title}</Text>
            {t.done_at && <Sub>{t.done_at.slice(0, 10)} 완료</Sub>}
          </Card>
        ))}
      </StateView>
    </Screen>
  );
}
