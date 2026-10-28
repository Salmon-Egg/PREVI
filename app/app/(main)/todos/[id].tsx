// ▶ FE 17번에 해당하는 부분: T-2 할 일 상세 (근거, 마감, 신청 링크, 완료 체크, 채팅으로 묻기 → FE 32번 맥락 넘김)
// T-2 할 일 상세: 왜 나에게 해당하는지(근거), 마감, 신청 링크, 완료 체크, 채팅으로 묻기(맥락 넘김)
import { router, useLocalSearchParams } from 'expo-router';

import { Body, Button, Card, DdayBadge, openLink, Row, Screen, showAlert, StateView, Sub, Title } from '../../../components/ui';
import { api, ApiError, useApi } from '../../../lib/api';
import { askChat } from '../../../lib/chatStore';
import type { TodoDetail } from '../../../lib/types';

export default function TodoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: t, error, loading, reload, setData } = useApi<TodoDetail>(`/todos/${id}`);

  /** '완료했어요': 저장하자마자 들어오기 전 화면(할 일 목록·홈)으로 돌아감 → 그 화면이 다시 불러와서 이 일이 바로 빠짐
   *  '완료 취소'(완료 기록에서 열었을 때): 이 화면에 남아서 되돌린 상태를 보여 줌 */
  async function toggle() {
    if (!t) return;
    try {
      const next = await api.patch<TodoDetail>(`/todos/${t.id}`, { done: !t.done });
      if (!next.done) return setData(next);
      if (router.canGoBack()) router.back();
      else router.replace('/todos'); // 알림 등으로 이 화면부터 열었으면 할 일 목록으로
    } catch (e) {
      showAlert('저장하지 못했어요', (e as ApiError).message);
    }
  }

  return (
    <Screen title="할 일">
      <StateView loading={loading} error={error} empty={!t} onRetry={reload}>
        {t && (
          <>
            <Row><DdayBadge dDay={t.d_day} />{t.due_date && <Sub>마감 {t.due_date}</Sub>}</Row>
            <Title>{t.title}</Title>
            <Card>
              <Sub>왜 나에게 해당하나요?</Sub>
              <Body>{t.reason ?? '비서가 정리한 근거가 아직 없어요.'}</Body>
            </Card>
            {t.source?.kind === 'notice' && t.source.id && (
              <Button label="공지 자세히 보기" kind="ghost" onPress={() => router.push(`/notices/${t.source!.id}`)} />
            )}
            {t.link && <Button label="신청 페이지 열기" kind="ghost" onPress={() => openLink(t.link)} />}
            <Button label="채팅으로 묻기" kind="ghost"
              onPress={() => askChat(`${t.title} 어떻게 해?`, { kind: 'todo', id: t.id })} />
            <Button label={t.done ? '완료 취소' : '완료했어요'} onPress={toggle} />
          </>
        )}
      </StateView>
    </Screen>
  );
}
