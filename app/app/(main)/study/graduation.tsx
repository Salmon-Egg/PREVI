// ▶ FE 21번에 해당하는 부분: L-2 졸업 요건 상세 — 영역별 이수 현황, 남은 요건, 관련 마감
import { router } from 'expo-router';
import { View } from 'react-native';

import { Text } from '../../../components/Text';
import { AreaCard } from '../../../components/AreaCard';
import { Body, Card, DdayBadge, Pic, Row, Screen, StateView, Sub, Title } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import type { Graduation, Todo } from '../../../lib/types';

export default function GraduationDetail() {
  const { data, error, loading, reload } = useApi<Graduation>('/graduation');
  // 관련 마감: 졸업 종류 할 일 (GET /todos?type=graduation)
  const deadlines = useApi<Todo[]>('/todos?type=graduation&done=false');

  return (
    <Screen title="졸업 요건">
      <StateView loading={loading} error={error} empty={!data} onRetry={reload}>
        {data && (
          <>
            <Card style={{ backgroundColor: color.primarySoft, borderWidth: 0 }}>
              <Sub>졸업까지 남은 학점</Sub>
              <Text style={{ fontSize: 28, fontWeight: '800', color: color.primary }}>{data.remaining_total === null ? '확인 필요' : `${data.remaining_total}학점`}</Text>
              <View style={{ height: 10, borderRadius: 5, backgroundColor: '#CFE3D7', overflow: 'hidden' }}>
                <View style={{ width: `${Math.min(100, ((data.earned_total ?? 0) / data.required_total) * 100)}%`, height: 10, backgroundColor: color.primary }} />
              </View>
              <Sub>{data.earned_total === null ? '이수 학점은 학교 확인이 필요해요 (같은 과목 중복 등)' : `${data.earned_total} / ${data.required_total}학점 이수`}</Sub>
            </Card>

            <Title>영역별 이수 현황</Title>
            {/* 이수 학점 오른쪽 ⌄: 그 영역에서 들은 과목과 성적 */}
            {data.areas.map((a) => <AreaCard key={a.name} area={a} bar />)}

            <Title>남은 요건</Title>
            {data.requirements.map((r) => (
              <Card key={r.name} onPress={r.todo_id ? () => router.push(`/todos/${r.todo_id}`) : undefined}>
                <Row>
                  {r.done ? <Pic name="check" size={22} /> : <Text style={{ fontSize: 18 }}>{r.taking ? '📘' : r.done === null ? '❔' : '⬜'}</Text>}
                  <Body style={{ flex: 1 }}>{r.name}</Body>
                  {!r.done && r.taking && <Sub>수강 중</Sub>}
                  {r.todo_id && <Sub>할 일 ›</Sub>}
                </Row>
              </Card>
            ))}

            <Title>관련 마감</Title>
            {deadlines.data?.length ? deadlines.data.map((t) => (
              <Card key={t.id} onPress={() => router.push(`/todos/${t.id}`)}>
                <Row>
                  <DdayBadge dDay={t.d_day} type={t.type} />
                  <Body style={{ flex: 1, fontWeight: '700' }}>{t.title}</Body>
                </Row>
                {t.due_date && <Sub>마감 {t.due_date}</Sub>}
              </Card>
            )) : <Sub>다가오는 졸업 관련 마감이 없어요.</Sub>}
          </>
        )}
      </StateView>
    </Screen>
  );
}
