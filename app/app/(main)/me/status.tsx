// M-4 학적 정보 변경 + 확인 팝업. 휴학으로 바꾸면 A-3(휴·복학 안내)으로 연결.
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Body, Button, confirmAsk, Screen, StateView, Sub, s } from '../../../components/ui';
import { api, useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import { STATUS_KO, type Me, type Status } from '../../../lib/types';

function Choice<T extends string | number>({ items, value, onChange, label }: { items: T[]; value: T; onChange: (v: T) => void; label: (v: T) => string }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {items.map((v) => (
        <Pressable key={String(v)} onPress={() => onChange(v)} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: v === value ? color.primary : color.surface }}>
          <Text style={{ color: v === value ? '#fff' : color.ink, fontWeight: '700' }}>{label(v)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function StatusEdit() {
  const { data: me, error, loading, reload } = useApi<Me>('/me');
  const [form, setForm] = useState<Pick<Me, 'department' | 'minor' | 'grade' | 'semester' | 'status'> | null>(null);
  useEffect(() => {
    if (me && !form) setForm({ department: me.department, minor: me.minor, grade: me.grade, semester: me.semester, status: me.status });
  }, [me]);

  function save() {
    if (!form) return;
    confirmAsk('학적 정보를 변경할까요?', `${form.department} ${form.grade}학년 ${form.semester}학기 ${STATUS_KO[form.status]}\n잘못 입력하면 졸업 요건·장학 판정이 틀릴 수 있어요.`, '변경', async () => {
      await api.put('/me', form);
      if (form.status === 'leave' && me?.status !== 'leave') router.replace('/office/leave');
      else router.back();
    });
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: '학적 정보 변경' }} />
      <StateView loading={loading} error={error} empty={!form} onRetry={reload}>
        {form && (
          <>
            <Sub>주전공</Sub>
            <Choice items={['소프트웨어학과', '전자컴퓨터공학과']} value={form.department ?? ''} onChange={(department) => setForm({ ...form, department })} label={(v) => v} />
            <Sub>부전공 (없으면 비워 두기)</Sub>
            <TextInput style={[s.card, { fontSize: 15 }]} value={form.minor ?? ''} onChangeText={(t) => setForm({ ...form, minor: t || null })} />
            <Sub>학년</Sub>
            <Choice items={[1, 2, 3, 4]} value={form.grade ?? 1} onChange={(grade) => setForm({ ...form, grade })} label={(v) => `${v}학년`} />
            <Sub>학기</Sub>
            <Choice items={[1, 2]} value={form.semester ?? 1} onChange={(semester) => setForm({ ...form, semester })} label={(v) => `${v}학기`} />
            <Sub>학적 상태</Sub>
            <Choice<Status> items={['enrolled', 'leave', 'returned']} value={form.status} onChange={(status) => setForm({ ...form, status })} label={(v) => STATUS_KO[v]} />
            {form.status === 'leave' && <Body>휴학으로 바꾸면 비서가 복학 신청 기한을 할 일로 챙겨 드려요.</Body>}
            <Button label="학적 정보 변경하기" onPress={save} />
          </>
        )}
      </StateView>
    </Screen>
  );
}
