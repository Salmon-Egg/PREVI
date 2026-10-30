// 주운 물건 올리기 — 사진(선택 1장), 물건 정보, 주인 확인 질문·답, 보관 장소(답을 맞힌 학생에게만 보임)
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { Input, Label, NO_GROW, Select } from '../../../components/form';
import { Text } from '../../../components/Text';
import { Button, Screen, Sub } from '../../../components/ui';
import { api, attempt, useSubmit } from '../../../lib/api';
import { color } from '../../../lib/theme';
import { LOST_CATEGORIES, type LostCategory, type LostItemDetail } from '../../../lib/types';

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function LostNew() {
  const [form, setForm] = useState({ title: '', category: '기타' as LostCategory, place: '', found_on: today(), description: '', question: '', answer: '', storage_place: '' });
  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const { busy, run } = useSubmit();
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));
  const ready = form.title.trim() && form.place.trim() && /^\d{4}-\d{2}-\d{2}$/.test(form.found_on)
    && form.question.trim() && form.answer.trim() && form.storage_place.trim();

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, base64: true });
    const a = res.assets?.[0];
    if (!res.canceled && a?.base64) setPhoto({ uri: a.uri, base64: a.base64 });
  }

  const submit = () => run(async () => {
    let saved: LostItemDetail | undefined;
    const ok = await attempt(async () => { saved = await api.post<LostItemDetail>('/lost-items', { ...form, image_base64: photo?.base64 }); });
    if (ok && saved) router.replace(`/lost/${saved.id}`);
  });

  return (
    <Screen title="주운 물건 올리기" footer={<Button label={busy ? '올리는 중…' : '올리기'} disabled={!ready || busy} onPress={submit} />}>
      <Label>사진</Label>
      <Pressable onPress={pick} accessibilityLabel="사진 고르기"
        style={{ height: 160, borderRadius: 14, borderWidth: 1.5, borderColor: color.field, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {photo ? <Image source={{ uri: photo.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <Text style={{ color: color.inkSub }}>눌러서 사진 고르기 (선택)</Text>}
      </Pressable>
      {photo && <Pressable onPress={() => setPhoto(null)}><Sub style={{ color: color.primary }}>사진 빼기</Sub></Pressable>}

      <Label required>물건 이름</Label>
      <Input style={NO_GROW} value={form.title} onChangeText={set('title')} placeholder="예) 검은색 에어팟 케이스" maxLength={100} />
      <Label required>종류</Label>
      <Select value={form.category} items={[...LOST_CATEGORIES]} onChange={set('category')} title="종류" />
      <Label required>주운 곳</Label>
      <Input style={NO_GROW} value={form.place} onChangeText={set('place')} placeholder="예) 북악관 3층 복도" maxLength={100} />
      <Label required>주운 날 (YYYY-MM-DD)</Label>
      <Input style={NO_GROW} value={form.found_on} onChangeText={set('found_on')} placeholder="2026-10-30" maxLength={10} />
      <Label>설명</Label>
      <Input style={{ ...NO_GROW, minHeight: 120, textAlignVertical: 'top' }} value={form.description} onChangeText={set('description')} placeholder="주인을 알아볼 만한 특징은 아래 질문으로 남겨 주세요" maxLength={1000} multiline />

      <View style={{ height: 8 }} />
      <Sub>주인만 알 만한 질문을 정해 주세요. 맞게 답한 학생에게만 보관 장소가 보여요. (띄어쓰기·대소문자 무시, 3번까지)</Sub>
      <Label required>확인 질문</Label>
      <Input style={NO_GROW} value={form.question} onChangeText={set('question')} placeholder="예) 케이스에 붙은 스티커 색은?" maxLength={100} />
      <Label required>정답</Label>
      <Input style={NO_GROW} value={form.answer} onChangeText={set('answer')} placeholder="예) 노란색" maxLength={50} />
      <Label required>보관 장소</Label>
      <Input style={NO_GROW} value={form.storage_place} onChangeText={set('storage_place')} placeholder="예) 학생지원팀(북악관 1층)에 맡김" maxLength={100} />
    </Screen>
  );
}
