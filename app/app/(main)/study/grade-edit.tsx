// L-10 성적 항목 추가·수정. 저장하면 서버가 졸업 요건·장학 판정을 다시 계산해서 알려 줌.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Button, Screen, showAlert, Sub, s } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { color } from '../../../lib/theme';

const GRADES = ['A+', 'A0', 'B+', 'B0', 'C+', 'C0', 'D+', 'D0', 'F', 'P'];
const AREAS = ['전공', '교양 필수', '교양 선택'];

function Pick({ items, value, onChange }: { items: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((v) => (
        <Pressable key={v} onPress={() => onChange(v)} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: v === value ? color.primary : color.surface }}>
          <Text style={{ color: v === value ? '#fff' : color.ink, fontWeight: '700' }}>{v}</Text>
        </Pressable>
      ))}
    </View>
  );
}

type Recalc = { recalculated: { remaining_total: number | null; new_eligible_scholarships: number } };

export default function GradeEdit() {
  const p = useLocalSearchParams<{ id?: string; term?: string; course_name?: string; credits?: string; grade?: string; area?: string }>();
  const [term, setTerm] = useState(p.term ?? '4-1');
  const [name, setName] = useState(p.course_name ?? '');
  const [credits, setCredits] = useState(p.credits ?? '3');
  const [grade, setGrade] = useState(p.grade ?? 'A+');
  const [area, setArea] = useState(p.area ?? '전공');

  async function save() {
    const body = { term, course_name: name, credits: Number(credits), grade, area };
    try {
      const res = p.id ? await api.put<Recalc>(`/grades/${p.id}`, body) : await api.post<Recalc>('/grades', body);
      const r = res.recalculated;
      const extra = r.new_eligible_scholarships ? `\n새로 신청할 수 있는 장학금 ${r.new_eligible_scholarships}개가 생겼어요!` : '';
      showAlert('저장했어요', `졸업까지 ${r.remaining_total ?? '-'}학점 남았어요.${extra}`);
      router.back();
    } catch (e) {
      showAlert('저장 실패', (e as ApiError).message);
    }
  }

  const field = [s.card, { fontSize: 15 }];
  return (
    <Screen>
      <Stack.Screen options={{ title: p.id ? '성적 수정' : '성적 추가' }} />
      <Sub>이수 학기 (예: 4-1 = 4학년 1학기)</Sub>
      <TextInput style={field} value={term} onChangeText={setTerm} />
      <Sub>과목명</Sub>
      <TextInput style={field} value={name} onChangeText={setName} placeholder="예: 모바일앱프로그래밍" />
      <Sub>학점</Sub>
      <TextInput style={field} value={credits} onChangeText={setCredits} keyboardType="number-pad" />
      <Sub>취득 성적</Sub>
      <Pick items={GRADES} value={grade} onChange={setGrade} />
      <Sub>이수 영역</Sub>
      <Pick items={AREAS} value={area} onChange={setArea} />
      <Sub>직접 입력한 성적은 졸업 학점 계산과 장학금 판정에 반영돼요.</Sub>
      <Button label="저장하기" disabled={!name} onPress={save} />
    </Screen>
  );
}
