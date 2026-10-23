// S-2 공지 상세 (장학 공지면 판정 + 신청 완료 체크): AI 요약, 원문 링크
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { Body, Button, Card, Row, Screen, StateView, Sub, Title, VerdictBadge } from '../../../components/ui';
import { api, useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import type { NoticeDetail } from '../../../lib/types';

export default function Notice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: n, error, loading, reload } = useApi<NoticeDetail>(`/notices/${id}`);

  async function markApplied() {
    if (!n?.todo_id) return;
    await api.patch(`/todos/${n.todo_id}`, { done: true }); // 서버가 신청 내역에 기록
    reload();
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: '공지' }} />
      <StateView loading={loading} error={error} empty={!n} onRetry={reload}>
        {n && (
          <>
            {n.category && <Sub>{n.category} 공지{n.deadline ? ` · 마감 ${n.deadline.slice(0, 16).replace('T', ' ')}` : ''}</Sub>}
            <Title>{n.title}</Title>
            <Card style={{ backgroundColor: color.primarySoft, borderWidth: 0 }}>
              <Sub>AI 핵심 요약</Sub>
              {n.summary.map((l) => <Body key={l}>{l}</Body>)}
            </Card>
            {n.eligibility && (
              <Card>
                <Row><Sub>나의 판정</Sub><VerdictBadge verdict={n.eligibility.verdict} /></Row>
                {n.eligibility.reasons.map((r) => <Body key={r}>· {r}</Body>)}
              </Card>
            )}
            {n.documents.length > 0 && <Sub>제출 서류: {n.documents.join(', ')}</Sub>}
            <Sub>AI 요약은 공지를 바탕으로 만들었어요. 신청 전에 원문을 꼭 확인해 주세요.</Sub>
            {n.url && <Button label="원문 공지 보기" kind="ghost" onPress={() => Linking.openURL(n.url!)} />}
            <Button label="채팅으로 묻기" kind="ghost"
              onPress={() => router.push({ pathname: '/chat', params: { contextKind: 'notice', contextId: String(n.id), q: '이 공지 나도 해당돼?' } })} />
            {n.applied ? <Sub>✅ 신청 완료로 기록했어요</Sub> : n.todo_id ? <Button label="신청 완료 체크" onPress={markApplied} /> : null}
          </>
        )}
      </StateView>
    </Screen>
  );
}
