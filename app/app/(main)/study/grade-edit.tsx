// 시안 11 성적 항목 추가/수정. 저장하면 서버가 졸업 요건·장학 판정을 다시 계산해서 알려 줌.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Input, Label, Segmented, Select } from '../../../components/form';
import { Button, Screen, showAlert } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { termLabel } from '../../../lib/format';
import { color } from '../../../lib/theme';

const TERMS = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
const GRADES = ['A+', 'A0', 'B+', 'B0', 'C+', 'C0', 'D+', 'D0', 'F', 'P'];
const POINT: Record<string, string> = { 'A+': '4.5', A0: '4.0', 'B+': '3.5', B0: '3.0', 'C+': '2.5', C0: '2.0', 'D+': '1.5', D0: '1.0', F: '0', P: '통과' };
const AREAS = ['전공', '교양 필수', '교양 선택'];

type Recalc = { recalculated: { remaining_total: number | null; new_eligible_scholarships: number } };

export default function GradeEdit() {
  const p = useLocalSearchParams<{ id?: string; term?: string; course_name?: string; credits?: string; grade?: string; area?: string }>();
  const [term, setTerm] = useState(p.term ?? '4-1');
  const [name, setName] = useState(p.course_name ?? '');
  const [credits, setCredits] = useState(Number(p.credits ?? 3));
  const [grade, setGrade] = useState(p.grade ?? 'A+');
  const [area, setArea] = useState(p.area ?? '전공');

  async function save() {
    const body = { term, course_name: name, credits, grade, area };
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

  return (
    <Screen>
      <Stack.Screen options={{ title: '성적 항목 추가/수정' }} />
      <Label>이수 학기</Label>
      <Select value={term} items={TERMS} label={termLabel} onChange={setTerm} />
      <Label>과목명</Label>
      <Input value={name} onChangeText={setName} placeholder="예: 모바일앱프로그래밍" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Label>학점 (이수 단위)</Label>
          <Select value={credits} items={[1, 2, 3, 4]} label={(v) => `${v} 학점`} onChange={setCredits} />
        </View>
        <View style={{ flex: 1 }}>
          <Label>취득 성적</Label>
          <Select value={grade} items={GRADES} label={(v) => `${v} (${POINT[v]})`} onChange={setGrade} highlight />
        </View>
      </View>
      <Label>이수 영역</Label>
      <Segmented value={area} items={AREAS} onChange={setArea} />
      <View style={{ backgroundColor: color.primarySoft, borderRadius: 12, padding: 12 }}>
        <Text style={{ fontSize: 13, color: color.primary }}>💡 직접 수정/입력한 성적은 졸업 학점 계산에 반영돼요.</Text>
      </View>
      <Button label="저장하기" disabled={!name} onPress={save} />
    </Screen>
  );
}
