// ▶ FE 17번에 해당하는 부분: T-2 할 일 상세 (근거, 마감, 신청 링크, 완료 체크, 채팅으로 묻기 → FE 32번 맥락 넘김)
// T-2 할 일 상세: 왜 나에게 해당하는지(근거), 마감, 신청 링크, 완료 체크, 채팅으로 묻기(맥락 넘김)
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';

import { Body, Button, Card, DdayBadge, Row, Screen, StateView, Sub, Title } from '../../../components/ui';
import { api, useApi } from '../../../lib/api';
import type { TodoDetail } from '../../../lib/types';

export default function TodoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: t, error, loading, reload, setData } = useApi<TodoDetail>(`/todos/${id}`);

  async function toggle() {
    if (!t) return;
    setData(await api.patch<TodoDetail>(`/todos/${t.id}`, { done: !t.done }));
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: '할 일' }} />
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
            {t.link && <Button label="신청 페이지 열기" kind="ghost" onPress={() => Linking.openURL(t.link!)} />}
            <Button label="채팅으로 묻기" kind="ghost"
              onPress={() => router.push({ pathname: '/chat', params: { contextKind: 'todo', contextId: String(t.id), q: `${t.title} 어떻게 해?` } })} />
            <Button label={t.done ? '완료 취소' : '완료했어요'} onPress={toggle} />
          </>
        )}
      </StateView>
    </Screen>
  );
}
