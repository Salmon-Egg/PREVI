// ▶ FE 35번에 해당하는 부분: C-2 습득물 제보 — 사진 → AI가 물건 정보 자동 입력(초안) → 확인·수정 → 제보 (피그마 06_ai_chat ④)
// 사진 속 개인정보(카드 번호·이름 등)는 서버가 가려서 저장함. 앱은 사진을 줄여서 보내기만 함 (lib/photo.ts)
import { Feather } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Input, Label, Select } from '../../../components/form';
import { Button, Row, Screen, showAlert, Sub } from '../../../components/ui';
import { api, ApiError, useSubmit } from '../../../lib/api';
import { pickPhoto, type Photo } from '../../../lib/photo';
import { color } from '../../../lib/theme';
import { LOST_CATEGORIES } from '../../../lib/types';
const KEEP = ['학생지원팀 (학생회관 1층)', '중앙도서관 안내데스크', '직접 보관 중'];

type Draft = { title: string; category: string; place: string; description: string };

export default function FoundNew() {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [draft, setDraft] = useState<Draft>({ title: '', category: '기타', place: '', description: '' });
  const [keep, setKeep] = useState(KEEP[0]);
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  async function choose(camera: boolean) {
    const p = await pickPhoto(camera);
    if (!p) return;
    setPhoto(p);
    // 사진을 보내면 AI(Gemma 3)가 물건 이름·종류·특징을 초안으로 채워 줌
    setAnalyzing(true);
    try {
      const ai = await api.post<Draft>('/lost-items/analyze', { image_base64: p.base64 });
      setDraft((d) => ({ ...d, ...ai, place: d.place || ai.place }));
    } catch (e) {
      showAlert('사진 분석 실패', `${(e as ApiError).message}\n직접 입력해 주세요.`);
    } finally {
      setAnalyzing(false);
    }
  }

  const { busy, run } = useSubmit();

  const submit = () => run(async () => {
    try {
      await api.post('/lost-items', { kind: 'found', ...draft, keep_at: keep, image_base64: photo?.base64 ?? null });
      showAlert('제보했어요', '비슷한 분실 신고가 있으면 주인에게 바로 알려 드릴게요.');
      router.back();
    } catch (e) {
      showAlert('제보 실패', (e as ApiError).message);
    }
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: '습득물 제보' }} />
      <Pressable style={st.photo} onPress={() => choose(false)}>
        {photo ? <Image source={{ uri: photo.uri }} style={st.img} /> : (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Feather name="image" size={32} color={color.inkSub} />
            <Sub>사진을 고르면 AI가 내용을 채워 드려요</Sub>
          </View>
        )}
      </Pressable>
      <Row>
        <View style={{ flex: 1 }}><Button label="📷 촬영하기" kind="ghost" onPress={() => choose(true)} /></View>
        <View style={{ flex: 1 }}><Button label="🖼 앨범에서" kind="ghost" onPress={() => choose(false)} /></View>
      </Row>
      {analyzing && <Row><ActivityIndicator color={color.primary} /><Sub>AI가 사진을 보고 제보서 초안을 쓰는 중…</Sub></Row>}

      <View style={st.draft}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={st.draftTitle}>습득물 제보서 {photo && !analyzing ? '(AI 초안)' : ''}</Text>
          <Sub>직접 고칠 수 있어요</Sub>
        </Row>
        <Label required>물건 이름</Label>
        <Input value={draft.title} onChangeText={(title) => set({ title })} placeholder="예: 검정 반지갑" />
        <Label required>종류</Label>
        <Select value={draft.category} items={LOST_CATEGORIES} onChange={(category) => set({ category })} />
        <Label required>발견 장소</Label>
        <Input value={draft.place} onChangeText={(place) => set({ place })} placeholder="예: 인문관 2층 복도" />
        <Label>특징</Label>
        <Input value={draft.description} onChangeText={(description) => set({ description })} placeholder="색, 브랜드, 들어 있던 것 (개인정보는 적지 마세요)" multiline />
        <Label required>맡긴 곳</Label>
        <Select value={keep} items={KEEP} onChange={setKeep} />
      </View>
      <Button label="이대로 제보하기" disabled={busy || !draft.title.trim() || !draft.place.trim()} onPress={submit} />
    </Screen>
  );
}

const st = StyleSheet.create({
  photo: { height: 180, borderRadius: 16, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  draft: { borderWidth: 1, borderColor: color.line, borderRadius: 16, padding: 14, gap: 6 },
  draftTitle: { fontSize: 16, fontWeight: '800', color: color.primary },
});
