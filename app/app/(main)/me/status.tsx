// 시안 15 학적 정보 변경 + 시안 16 확인 창. 휴학으로 바꾸면 A-3(휴·복학 안내)으로 연결.
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Confirm, Label, Segmented, Select } from '../../../components/form';
import { Button, Screen, StateView } from '../../../components/ui';
import { api, useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import { STATUS_KO, type Me, type Status } from '../../../lib/types';

const DEPTS = ['소프트웨어학과', '전자컴퓨터공학과'];
const MINORS = ['없음', '경영학부 (부전공)', '소프트웨어학과 (복수전공)', '전자컴퓨터공학과 (복수전공)'];
const STATUSES: Status[] = ['enrolled', 'leave', 'returned'];

type Form = { department: string; minor: string; status: Status; grade: number; semester: number };

export default function StatusEdit() {
  const { data: me, error, loading, reload } = useApi<Me>('/me');
  const [form, setForm] = useState<Form | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (me && !form) {
      setForm({ department: me.department ?? DEPTS[0], minor: me.minor ?? '없음', status: me.status, grade: me.grade ?? 1, semester: me.semester ?? 1 });
    }
  }, [me]);

  async function save() {
    if (!form) return;
    setAsking(false);
    await api.put('/me', { ...form, minor: form.minor === '없음' ? null : form.minor });
    if (form.status === 'leave' && me?.status !== 'leave') router.replace('/office/leave');
    else router.back();
  }

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));

  return (
    <Screen>
      <Stack.Screen options={{ title: '학적 정보 변경' }} />
      <StateView loading={loading} error={error} empty={!form} onRetry={reload}>
        {form && (
          <>
            <Label required>주전공</Label>
            <Select value={form.department} items={DEPTS} onChange={(department) => set({ department })} />
            <Label>복수 / 부전공 선택</Label>
            <Select value={form.minor} items={MINORS} onChange={(minor) => set({ minor })} highlight={form.minor !== '없음'} />
            <Label required>학적 상태 변경</Label>
            <Segmented value={form.status} items={STATUSES} label={(v) => STATUS_KO[v]} onChange={(status) => set({ status })} />
            <Label required>현재 학년 및 이수 학기</Label>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Select value={form.grade} items={[1, 2, 3, 4]} label={(v) => `${v}학년`} onChange={(grade) => set({ grade })} /></View>
              <View style={{ flex: 1 }}><Select value={form.semester} items={[1, 2]} label={(v) => `${v}학기`} onChange={(semester) => set({ semester })} /></View>
            </View>
            {form.status === 'leave' && <Text style={st.hint}>휴학으로 바꾸면 비서가 복학 신청 기한을 할 일로 챙겨 드려요.</Text>}
            <View style={{ height: 12 }} />
            <Button label="학적 정보 변경하기" onPress={() => setAsking(true)} />
          </>
        )}
      </StateView>

      {/* 시안 16 확인 창 */}
      <Confirm visible={asking} title="학적 정보를 변경하시겠습니까?" okLabel="확인 및 변경 완료" onOk={save} onCancel={() => setAsking(false)}>
        {form && (
          <>
            <View style={st.box}>
              <Text style={st.boxMain}>{form.department} ({form.grade}학년 {form.semester}학기 {STATUS_KO[form.status]})</Text>
              {form.minor !== '없음' && <Text style={st.boxSub}>{form.minor}</Text>}
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
  hint: { fontSize: 13, color: color.primary, marginTop: 4 },
  box: { alignSelf: 'stretch', backgroundColor: color.surface, borderRadius: 12, padding: 14, alignItems: 'center', gap: 4 },
  boxMain: { fontSize: 15, fontWeight: '800', color: color.primary, textAlign: 'center' },
  boxSub: { fontSize: 13, color: color.inkSub },
  ask: { fontSize: 14, fontWeight: '700', color: color.ink, textAlign: 'center' },
  warn: { fontSize: 12, color: color.alert, textAlign: 'center', lineHeight: 18 },
});
