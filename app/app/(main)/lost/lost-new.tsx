// ▶ FE 35번에 해당하는 부분: C-3 분실 신고 작성 — 저장하면 AI가 습득물과 비교해서 비슷한 게 있으면 알려 줌
import { router, Stack } from 'expo-router';
import { useState } from 'react';

import { Input, Label, Select } from '../../../components/form';
import { Button, Screen, showAlert, Sub } from '../../../components/ui';
import { api, ApiError, useSubmit } from '../../../lib/api';
import { LOST_CATEGORIES } from '../../../lib/types';

export default function LostNew() {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(LOST_CATEGORIES[0]);
  const [place, setPlace] = useState('');
  const [when, setWhen] = useState('');
  const [description, setDescription] = useState('');

  const { busy, run } = useSubmit();

  const submit = () => run(async () => {
    try {
      const res = await api.post<{ matches: number }>('/lost-items', { kind: 'lost', title, category, place, lost_at: when, description });
      showAlert('분실 신고를 올렸어요', res?.matches ? `비슷한 습득물 ${res.matches}개를 찾았어요. 분실물 센터 위쪽에서 확인해 보세요.` : '비슷한 습득물이 들어오면 바로 알려 드릴게요.');
      router.back();
    } catch (e) {
      showAlert('신고 실패', (e as ApiError).message);
    }
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: '분실 신고' }} />
      <Sub>자세히 적을수록 AI가 습득물과 정확하게 맞춰요. 연락처·카드 번호 같은 개인정보는 적지 마세요.</Sub>
      <Label required>잃어버린 물건</Label>
      <Input value={title} onChangeText={setTitle} placeholder="예: 검정 가죽 반지갑" />
      <Label required>종류</Label>
      <Select value={category} items={LOST_CATEGORIES} onChange={setCategory} />
      <Label required>잃어버린 곳 (추정)</Label>
      <Input value={place} onChangeText={setPlace} placeholder="예: 중앙도서관 3층 열람실" />
      <Label>잃어버린 때</Label>
      <Input value={when} onChangeText={setWhen} placeholder="예: 10/12 오후 3시쯤" />
      <Label>특징</Label>
      <Input value={description} onChangeText={setDescription} placeholder="색, 브랜드, 안에 든 것" multiline />
      <Button label="분실 신고 올리기" disabled={busy || !title.trim() || !place.trim()} onPress={submit} />
    </Screen>
  );
}
