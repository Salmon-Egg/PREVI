// L-1 내 학업 메인: 졸업 요건 요약 + 시간표(L-3) / 성적(L-8, L-9) 탭
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Body, Button, Card, confirmAsk, Row, Screen, StateView, Sub, Title } from '../../../components/ui';
import { api, useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import type { GradeTerm, Graduation, TimetableEntry } from '../../../lib/types';

const TABS = ['졸업', '시간표', '성적'] as const;
const DAYS = ['월', '화', '수', '목', '금'];

export default function Study() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('졸업');
  const grad = useApi<Graduation>('/graduation');

  return (
    <Screen>
      <Stack.Screen options={{ title: '내 학업' }} />
      <StateView loading={grad.loading} error={grad.error} empty={!grad.data} onRetry={grad.reload}>
        {grad.data && (
          <Card onPress={() => router.push('/study/graduation')} style={{ backgroundColor: color.primarySoft, borderWidth: 0 }}>
            <Sub>졸업까지 남은 학점</Sub>
            <Text style={{ fontSize: 28, fontWeight: '800', color: color.primary }}>{grad.data.remaining_total}학점</Text>
            <Sub>{grad.data.earned_total} / {grad.data.required_total} · 남은 요건 {grad.data.requirements.filter((r) => !r.done).length}가지 ›</Sub>
          </Card>
        )}
      </StateView>

      <View style={{ flexDirection: 'row', backgroundColor: color.surface, borderRadius: 12, padding: 4 }}>
        {TABS.map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={{ flex: 1, padding: 8, borderRadius: 9, backgroundColor: tab === t ? color.bg : undefined }}>
            <Text style={{ textAlign: 'center', fontWeight: '700', color: tab === t ? color.ink : color.inkSub }}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {tab === '졸업' && grad.data?.areas.map((a) => (
        <Card key={a.name}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body>{a.name}</Body>
            <Body style={{ fontWeight: '700', color: a.earned >= a.required ? color.primary : color.alert }}>{a.earned} / {a.required}</Body>
          </Row>
        </Card>
      ))}
      {tab === '시간표' && <Timetable />}
      {tab === '성적' && <Grades />}
    </Screen>
  );
}

function Timetable() {
  const { data, error, loading, reload } = useApi<TimetableEntry[]>('/timetable');

  function remove(e: TimetableEntry) {
    api.del(`/timetable/${e.id}`).then(reload);
  }

  return (
    <StateView loading={loading} error={error} empty={!data} onRetry={reload}>
      {DAYS.map((day) => {
        const items = (data ?? []).flatMap((e) => e.times.filter((t) => t.day === day).map((t) => ({ e, t })));
        return (
          <Row key={day} style={{ alignItems: 'flex-start' }}>
            <Text style={{ width: 24, fontWeight: '700', color: color.inkSub, paddingTop: 10 }}>{day}</Text>
            <View style={{ flex: 1, gap: 6 }}>
              {items.length === 0 && <Sub style={{ paddingTop: 10 }}>수업 없음</Sub>}
              {items.sort((a, b) => a.t.start.localeCompare(b.t.start)).map(({ e, t }) => (
                <Card key={`${e.id}-${t.start}`} onPress={() => confirmAsk(e.course_name, '시간표에서 뺄까요?', '빼기', () => remove(e))}>
                  <Body style={{ fontWeight: '600' }}>{e.course_name}</Body>
                  <Sub>{t.start}~{t.end} · {e.credits}학점</Sub>
                </Card>
              ))}
            </View>
          </Row>
        );
      })}
      <Sub>이번 학기 {(data ?? []).reduce((n, e) => n + e.credits, 0)}학점</Sub>
      <Button label="+ 과목 추가하기" onPress={() => router.push('/study/add-course')} />
    </StateView>
  );
}

function Grades() {
  const { data, error, loading, reload } = useApi<GradeTerm[]>('/grades');
  const [editing, setEditing] = useState(false);

  async function remove(id: number) {
    await api.del(`/grades/${id}`);
    reload();
  }

  return (
    <StateView loading={loading} error={error} empty={!data?.length} emptyText="입력한 성적이 없어요" onRetry={reload}>
      {data?.map((term) => (
        <Card key={term.term}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Title>{term.term.replace('-', '학년 ')}학기</Title>
            <Body style={{ fontWeight: '700' }}>{term.gpa ?? '-'} / 4.5</Body>
          </Row>
          {term.items.map((g) => (
            <Row key={g.id} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
              <Pressable style={{ flex: 1 }} disabled={!editing}
                onPress={() => router.push({ pathname: '/study/grade-edit', params: { ...g, id: String(g.id), credits: String(g.credits) } })}>
                <Body>{g.course_name} <Sub>({g.credits}학점 · {g.area})</Sub></Body>
              </Pressable>
              <Body style={{ fontWeight: '700' }}>{g.grade}</Body>
              {editing && <Pressable onPress={() => remove(g.id)}><Text style={{ color: color.alert, marginLeft: 12 }}>삭제</Text></Pressable>}
            </Row>
          ))}
        </Card>
      ))}
      {editing && <Button label="+ 과목 추가하기" kind="ghost" onPress={() => router.push('/study/grade-edit')} />}
      <Button label={editing ? '수정 완료하기' : '성적 수정하기'} onPress={() => setEditing(!editing)} />
    </StateView>
  );
}
