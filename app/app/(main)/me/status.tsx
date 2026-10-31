// ▶ FE 10번에 해당하는 부분: M-4 학적 정보 변경 + 확인 팝업 → 휴학 변경 시 A-3로 연결
// 새 시안 '학적 정보 변경': 주전공 · 복수/부전공 · 학적 상태 · 학년/학기 + 아래 PREVI 안내, 판 아래 '학적 정보 변경하기'
// 확인 창: 바꿀 내용 요약(연한 초록 상자) → 실제 학적과 맞는지 묻기 → [취소 | 확인 및 변경 완료]
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DeptPicker, MinorPicker } from '../../../components/DeptPicker';
import { Confirm, Input, Label, NO_GROW, Segmented, Select } from '../../../components/form';
import { Text } from '../../../components/Text';
import { Button, Character, Screen, showAlert, StateView } from '../../../components/ui';
import { api, ApiError, useApi, useSubmit } from '../../../lib/api';
import { ADMISSION_YEARS, STATUSES } from '../../../lib/constants';
import { color } from '../../../lib/theme';
import { STATUS_KO, type Me, type Status } from '../../../lib/types';

type Form = {
  department: string; minor: string; status: Status; grade: number; semester: number; admission_year: number | null;
  toeic: string; income: number; residence: string; // 선택 정보. 빈 값(소득은 -1)이면 지움
};

const formOf = (me: Me): Form => ({
  department: me.department ?? '', minor: me.minor ?? '없음', status: me.status, grade: me.grade ?? 1, semester: me.semester ?? 1,
  admission_year: me.admission_year,
  toeic: me.toeic_score?.toString() ?? '', income: me.income_bracket ?? -1, residence: me.residence ?? '',
});

/** 선택 정보는 바뀐 것만 보냄 */
function optionalChanges(form: Form, me: Me | null) {
  const next = { toeic_score: form.toeic ? Number(form.toeic) : null, income_bracket: form.income < 0 ? null : form.income, residence: form.residence.trim() || null };
  return Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== ((me as Record<string, unknown> | null)?.[k] ?? null)));
}

export default function StatusEdit() {
  const { data: me, error, loading, reload } = useApi<Me>('/me');
  // 고치기 전에는 서버 값을 그대로 보여 주고, 처음 고칠 때 그 값에서 시작
  const [edit, setEdit] = useState<Form | null>(null);
  const [asking, setAsking] = useState(false);
  const { busy, run } = useSubmit();
  const form = edit ?? (me ? formOf(me) : null);

  const save = () => run(async () => {
    if (!form) return;
    setAsking(false);
    try {
      const { toeic: _t, income: _i, residence: _r, ...academic } = form;
      await api.put('/me', { ...academic, minor: form.minor === '없음' ? null : form.minor, ...optionalChanges(form, me) });
    } catch (e) {
      return showAlert('저장하지 못했어요', (e as ApiError).message);
    }
    if (form.status === 'leave' && me?.status !== 'leave') router.replace('/office/leave');
    else router.back();
  });

  const set = (patch: Partial<Form>) => form && setEdit({ ...form, ...patch });

  return (
    <Screen title="학적 정보 변경" footer={form && <Button label="학적 정보 변경하기" disabled={busy || !form.department || !form.admission_year} onPress={() => setAsking(true)} />}>
      <StateView loading={loading} error={error} empty={!form} onRetry={reload}>
        {form && (
          <>
            <Label required>입학연도</Label>
            <Select value={form.admission_year ?? 0} items={form.admission_year && !ADMISSION_YEARS.includes(form.admission_year) ? [...ADMISSION_YEARS, form.admission_year] : ADMISSION_YEARS}
              label={(year) => year ? `${year}년` : '입학연도를 선택하세요'} onChange={(admission_year) => set({ admission_year })} />
            <Label required>주전공</Label>
            {/* 입학연도(내 정보)에 맞는 학과를 위로 올려 보여 줌 */}
            <DeptPicker value={form.department} year={form.admission_year} onChange={(department) => set({ department })} />
            <Label>복수 / 부전공 선택</Label>
            <MinorPicker value={form.minor} year={form.admission_year} onChange={(minor) => set({ minor })} />
            <Label required>학적 상태 변경</Label>
            <Segmented value={form.status} items={STATUSES} label={(v) => STATUS_KO[v]} onChange={(status) => set({ status })} />
            <Label required>현재 학년 및 이수 학기</Label>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Select value={form.grade} items={[1, 2, 3, 4]} label={(v) => `${v}학년`} onChange={(grade) => set({ grade })} /></View>
              <View style={{ flex: 1 }}><Select value={form.semester} items={[1, 2]} label={(v) => `${v}학기`} onChange={(semester) => set({ semester })} /></View>
            </View>
            <Label>장학금 판정용 정보 (선택)</Label>
            <Text style={st.hint2}>입력하면 장학금 조건을 바로 비교해 드려요. 비워 두면 ‘확인 필요’로 보여요.</Text>
            <Input style={NO_GROW} value={form.toeic} onChangeText={(toeic) => set({ toeic: toeic.replace(/\D/g, '').slice(0, 3) })} placeholder="토익 점수 (예: 800)" keyboardType="number-pad" accessibilityLabel="토익 점수" />
            <Select value={form.income} items={[-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]} label={(v) => (v < 0 ? '소득구간 입력 안 함' : `소득 ${v}구간`)} onChange={(income) => set({ income })} title="소득구간" />
            <Input style={NO_GROW} value={form.residence} onChangeText={(residence) => set({ residence })} placeholder="거주 시·군·구 (예: 안산시)" maxLength={50} accessibilityLabel="거주 지역" />
            {/* 시안: 아래 빈 곳의 마스코트 + 안내 */}
            <View style={st.mascot}>
              <Character size={130} />
              <Text style={st.hint}>
                {form.status === 'leave'
                  ? '휴학으로 바꾸면 프리비가 복학 신청 기한을\n할 일로 챙겨 드려요'
                  : '학적을 바꾸면 졸업 요건과 장학 자격을\n프리비가 다시 계산해 드려요'}
              </Text>
            </View>
          </>
        )}
      </StateView>

      <Confirm visible={asking} title="학적 정보를 변경하시겠습니까?" okLabel="확인 및 변경 완료" onOk={save} onCancel={() => setAsking(false)}>
        {form && (
          <>
            <View style={st.box}>
              <Text style={st.boxMain}>{form.department} ({form.grade}학년 {form.semester}학기 {STATUS_KO[form.status]})</Text>
              <Text style={st.boxSub}>{form.admission_year}년 입학</Text>
              {form.minor !== '없음' && <Text style={st.boxSub}>{form.minor.replace(/^(.+) \((.+)\)$/, '$2: $1')}</Text>}
            </View>
            <Text style={st.ask}>위 정보가 본인의 실제 학적 정보와 일치합니까?</Text>
            <Text style={st.warn}>※ 잘못된 학적 정보 입력 시 과목 추천, 졸업 요건 계산 및{'\n'}AI 시스템 전체 안내 서비스에서 에러가 발생할 수 있습니다.</Text>
          </>
        )}
      </Confirm>
    </Screen>
  );
}

const st = StyleSheet.create({
  // flexGrow만(줄어들지 않음): 화면이 짧아도 위 입력칸을 덮지 않고 아래로 밀려나 스크롤로 보임
  mascot: { flexGrow: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingTop: 28 },
  hint2: { fontSize: 12, color: color.inkSub },
  hint: { fontSize: 13, color: color.inkSub, textAlign: 'center', lineHeight: 19 },
  box: { alignSelf: 'stretch', backgroundColor: '#E6F4EC', borderWidth: 1, borderColor: color.field, borderRadius: 16, padding: 16, alignItems: 'center', gap: 6 },
  boxMain: { fontSize: 15, fontWeight: '800', color: color.ink, textAlign: 'center' },
  boxSub: { fontSize: 13, color: color.inkSub },
  ask: { fontSize: 14, fontWeight: '800', color: color.ink, textAlign: 'center', marginTop: 4 },
  warn: { fontSize: 12, color: color.inkSub, textAlign: 'center', lineHeight: 18 },
});
