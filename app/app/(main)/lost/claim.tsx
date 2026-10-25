// ▶ FE 35번에 해당하는 부분: C-5 수령 신청 — AI가 만든 본인 확인 질문에 답하기 (예: 지갑 안에 든 카드 종류)
// 답은 서버가 습득 제보 내용과 비교. 맞으면 보관처와 찾아가는 시간을 알려 줌
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Input, Label } from '../../../components/form';
import { Button, Card, Screen, showAlert, StateView, Sub } from '../../../components/ui';
import { api, ApiError, useSubmit, useApi } from '../../../lib/api';
import type { ClaimQuestion } from '../../../lib/types';

export default function Claim() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useApi<ClaimQuestion[]>(`/lost-items/${id}/questions`);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const done = !!data?.length && data.every((q) => answers[q.id]?.trim());

  const { busy, run } = useSubmit();

  const submit = () => run(async () => {
    try {
      const res = await api.post<{ ok: boolean; message: string }>(`/lost-items/${id}/claim`, { answers });
      showAlert(res.ok ? '본인 확인 완료' : '확인이 더 필요해요', res.message);
      if (res.ok) router.dismissTo('/campus');
    } catch (e) {
      showAlert('신청 실패', (e as ApiError).message);
    }
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: '수령 신청' }} />
      <Card><Sub>주인만 알 수 있는 질문이에요. 제보한 사람이 적은 내용과 비교해서 확인해요.</Sub></Card>
      <StateView loading={loading} error={error} empty={!data?.length} onRetry={reload}>
        {data?.map((q, n) => (
          <Card key={q.id}>
            <Label required>{`${n + 1}. ${q.question}`}</Label>
            <Input value={answers[q.id] ?? ''} onChangeText={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} placeholder="답 입력" />
          </Card>
        ))}
      </StateView>
      <Button label="수령 신청하기" disabled={busy || !done} onPress={submit} />
    </Screen>
  );
}
