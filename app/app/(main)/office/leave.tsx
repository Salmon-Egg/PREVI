// ▶ FE 29번에 해당하는 부분: A-3 휴·복학 안내 — 규정 근거, 장학 영향, 기한 → 할 일 등록
// 규정 근거·장학 영향은 챗봇이 학사요람(문서 검색)을 근거로 답함 → 화면에서 바로 물어볼 수 있게 함
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../../../components/Text';
import { Body, Button, Card, Row, Screen, showAlert, StateView, Sub, Title } from '../../../components/ui';
import { api, attempt, useApi } from '../../../lib/api';
import { askChat } from '../../../lib/chatStore';
import { ddayOf } from '../../../lib/format';
import { color } from '../../../lib/theme';
import { STATUS_KO, type CalendarEvent, type Me, type Scholarship } from '../../../lib/types';

// 규정이 궁금할 때 묻는 질문 (주제별)
const TOPICS: { icon: keyof typeof Feather.glyphMap; title: string; q: string }[] = [
  { icon: 'book-open', title: '규정 근거', q: '휴학은 한 번에 얼마나 할 수 있어? 학칙 근거도 알려줘' },
  { icon: 'award', title: '장학금 영향', q: '휴학하면 장학금은 어떻게 돼?' },
  { icon: 'calendar', title: '복학 신청 기간', q: '복학 신청은 언제 해?' },
];

export default function Leave() {
  const me = useApi<Me>('/me');
  const cal = useApi<CalendarEvent[]>('/calendar');
  const sch = useApi<Scholarship[]>('/scholarships');
  // 서버(GET /calendar)는 d_day를 안 줌 → 앱에서 계산
  const period = cal.data?.map((e) => ({ ...e, d_day: e.d_day ?? ddayOf(e.start_date) }))
    .find((e) => (e.title.includes('휴학') || e.title.includes('복학')) && e.d_day >= 0);
  // 장학 영향: 지금 신청했거나 신청 가능한 장학금 (휴학하면 대부분 재학생 대상이라 다시 확인 필요)
  const affected = (sch.data ?? []).filter((s) => s.applied || s.verdict === 'eligible');

  async function addTodo() {
    if (!period) return;
    const ok = await attempt(() => api.post('/todos', { title: period.title, due_date: period.end_date ?? period.start_date, type: 'status' }), '할 일에 등록하지 못했어요');
    if (ok) showAlert('할 일에 등록했어요', '마감 전날과 당일에 알려 드릴게요.');
  }

  // ▶ FE 32번에 해당하는 부분: A-3에서 넘어온 맥락(학적)으로 대화 시작
  const ask = (q: string) => askChat(q, { kind: 'status', id: 0 });

  return (
    <Screen title="휴·복학 안내">
      <StateView loading={me.loading || cal.loading} error={me.error ?? cal.error} empty={!me.data} onRetry={me.reload}>
        {me.data && (
          <Card style={{ backgroundColor: color.primarySoft, borderWidth: 0 }}>
            <Sub>지금 내 학적</Sub>
            <Row style={{ justifyContent: 'space-between' }}>
              <Title>{STATUS_KO[me.data.status]} · {me.data.grade}학년 {me.data.semester}학기</Title>
              <Pressable onPress={() => router.push('/me/status')}><Sub style={{ color: color.primary, fontWeight: '700' }}>변경 ›</Sub></Pressable>
            </Row>
          </Card>
        )}

        {period ? (
          <Card>
            <Sub>신청 기간 · {period.d_day === 0 ? '오늘' : `D-${period.d_day}`}</Sub>
            <Body style={{ fontWeight: '700' }}>{period.title}</Body>
            <Sub>{period.start_date} ~ {period.end_date}</Sub>
            <Button label="할 일로 등록 (마감 알림)" onPress={addTodo} />
          </Card>
        ) : (
          <Sub>지금은 휴·복학 신청 기간이 아니에요. 기간이 열리면 알려 드릴게요.</Sub>
        )}

        <Title>장학금에 미치는 영향</Title>
        {affected.length ? (
          <Card style={{ backgroundColor: color.warmSoft, borderColor: color.warmSoft }}>
            <Sub style={{ color: color.alert, fontWeight: '700' }}>휴학하면 아래 장학금은 다시 확인이 필요해요</Sub>
            {affected.map((s) => <Body key={s.notice_id}>· {s.title.replace(/ 안내$/, '')}{s.applied ? ' (신청 완료)' : ''}</Body>)}
            <Pressable onPress={() => ask('휴학하면 내가 신청한 장학금은 어떻게 돼?')}>
              <Sub style={{ color: color.primary, fontWeight: '700' }}>규정 근거로 물어보기 ›</Sub>
            </Pressable>
          </Card>
        ) : <Sub>지금 신청했거나 신청할 수 있는 장학금이 없어요.</Sub>}

        <Title>규정이 궁금하면 물어보세요</Title>
        <Sub>학사요람·학칙을 근거로 답하고 출처를 함께 보여 줘요.</Sub>
        {TOPICS.map((t) => (
          <Pressable key={t.title} style={st.topic} onPress={() => ask(t.q)}>
            <View style={st.icon}><Feather name={t.icon} size={18} color={color.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={st.topicTitle}>{t.title}</Text>
              <Sub>{t.q}</Sub>
            </View>
            <Feather name="chevron-right" size={18} color={color.inkSub} />
          </Pressable>
        ))}
      </StateView>
    </Screen>
  );
}

const st = StyleSheet.create({
  topic: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: color.line, borderRadius: 14, padding: 12 },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.primarySoft, alignItems: 'center', justifyContent: 'center' },
  topicTitle: { fontSize: 15, fontWeight: '700', color: color.ink },
});
