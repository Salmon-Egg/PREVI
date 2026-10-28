// ▶ FE 10번에 해당하는 부분: M-4 학적 정보 변경 + 확인 팝업 → 휴학 변경 시 A-3로 연결
// 새 시안 '학적 정보 변경': 주전공 · 복수/부전공 · 학적 상태 · 학년/학기 + 아래 PREVI 안내, 판 아래 '학적 정보 변경하기'
// 확인 창: 바꿀 내용 요약(연한 초록 상자) → 실제 학적과 맞는지 묻기 → [취소 | 확인 및 변경 완료]
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DeptPicker, MinorPicker } from '../../../components/DeptPicker';
import { Confirm, Label, Segmented, Select } from '../../../components/form';
import { Text } from '../../../components/Text';
import { Button, Character, Screen, showAlert, StateView } from '../../../components/ui';
import { api, ApiError, useApi, useSubmit } from '../../../lib/api';
import { STATUSES } from '../../../lib/constants';
import { color } from '../../../lib/theme';
import { STATUS_KO, type Me, type Status } from '../../../lib/types';

type Form = { department: string; minor: string; status: Status; grade: number; semester: number };

const formOf = (me: Me): Form => ({
  department: me.department ?? '', minor: me.minor ?? '없음', status: me.status, grade: me.grade ?? 1, semester: me.semester ?? 1,
});

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
      await api.put('/me', { ...form, minor: form.minor === '없음' ? null : form.minor });
    } catch (e) {
      return showAlert('저장하지 못했어요', (e as ApiError).message);
    }
    if (form.status === 'leave' && me?.status !== 'leave') router.replace('/office/leave');
    else router.back();
  });

  const set = (patch: Partial<Form>) => form && setEdit({ ...form, ...patch });

  return (
    <Screen title="학적 정보 변경" footer={form && <Button label="학적 정보 변경하기" disabled={busy || !form.department} onPress={() => setAsking(true)} />}>
      <StateView loading={loading} error={error} empty={!form} onRetry={reload}>
        {form && (
          <>
            <Label required>주전공</Label>
            {/* 입학연도(내 정보)에 맞는 학과를 위로 올려 보여 줌 */}
            <DeptPicker value={form.department} year={me?.admission_year ?? null} onChange={(department) => set({ department })} />
            <Label>복수 / 부전공 선택</Label>
            <MinorPicker value={form.minor} year={me?.admission_year ?? null} onChange={(minor) => set({ minor })} />
            <Label required>학적 상태 변경</Label>
            <Segmented value={form.status} items={STATUSES} label={(v) => STATUS_KO[v]} onChange={(status) => set({ status })} />
            <Label required>현재 학년 및 이수 학기</Label>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Select value={form.grade} items={[1, 2, 3, 4]} label={(v) => `${v}학년`} onChange={(grade) => set({ grade })} /></View>
              <View style={{ flex: 1 }}><Select value={form.semester} items={[1, 2]} label={(v) => `${v}학기`} onChange={(semester) => set({ semester })} /></View>
            </View>
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
  mascot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingTop: 28 },
  hint: { fontSize: 13, color: color.inkSub, textAlign: 'center', lineHeight: 19 },
  box: { alignSelf: 'stretch', backgroundColor: '#E6F4EC', borderWidth: 1, borderColor: color.field, borderRadius: 16, padding: 16, alignItems: 'center', gap: 6 },
  boxMain: { fontSize: 15, fontWeight: '800', color: color.ink, textAlign: 'center' },
  boxSub: { fontSize: 13, color: color.inkSub },
  ask: { fontSize: 14, fontWeight: '800', color: color.ink, textAlign: 'center', marginTop: 4 },
  warn: { fontSize: 12, color: color.inkSub, textAlign: 'center', lineHeight: 18 },
});
