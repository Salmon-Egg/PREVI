// A-3 휴·복학 안내: 내 학적, 휴·복학 신청 기간(학사일정), 할 일 등록, 규정은 챗봇이 문서 근거로 답함
import { router, Stack } from 'expo-router';

import { Body, Button, Card, Screen, showAlert, StateView, Sub, Title } from '../../../components/ui';
import { api, useApi } from '../../../lib/api';
import { STATUS_KO, type CalendarEvent, type Me } from '../../../lib/types';

const QUESTIONS = ['휴학하면 장학금은 어떻게 돼?', '복학 신청은 언제 해?', '휴학은 한 번에 얼마나 할 수 있어?'];

export default function Leave() {
  const me = useApi<Me>('/me');
  const cal = useApi<CalendarEvent[]>('/calendar');
  const period = cal.data?.find((e) => e.title.includes('휴학') || e.title.includes('복학'));

  async function addTodo() {
    if (!period) return;
    await api.post('/todos', { title: period.title, due_date: period.end_date ?? period.start_date, type: 'status', source: { kind: 'calendar', id: period.id } });
    showAlert('할 일에 등록했어요', '마감 전날과 당일에 알려 드릴게요.');
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: '휴·복학 안내' }} />
      <StateView loading={me.loading || cal.loading} error={me.error ?? cal.error} empty={!me.data} onRetry={me.reload}>
        {me.data && (
          <Card>
            <Sub>지금 내 학적</Sub>
            <Title>{STATUS_KO[me.data.status]}</Title>
            <Button label="학적 정보 바꾸기" kind="ghost" onPress={() => router.push('/me/status')} />
          </Card>
        )}
        {period && (
          <Card>
            <Sub>신청 기간 · D-{period.d_day}</Sub>
            <Body style={{ fontWeight: '700' }}>{period.title}</Body>
            <Sub>{period.start_date} ~ {period.end_date}</Sub>
            <Button label="할 일로 등록 (마감 알림)" onPress={addTodo} />
          </Card>
        )}
        <Title>규정이 궁금하면 물어보세요</Title>
        {QUESTIONS.map((q) => (
          <Card key={q} onPress={() => router.push({ pathname: '/chat', params: { q } })}><Body>{q}</Body></Card>
        ))}
      </StateView>
    </Screen>
  );
}
