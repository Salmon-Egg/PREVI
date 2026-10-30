// ▶ FE 8번·10번에 해당하는 부분: 학과·전공 고르기 (처음 설정·학적 정보 변경)
// 창 안: [현재 학과·전공 | 개편 전 학과·전공] + 검색. 입학연도에 맞는 학과는 위로 올리고 '추천' 표시 (막지는 않음 — lib/departments.ts)
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CURRENT_DEPTS, LEGACY_DEPTS, recommended, type Dept } from '../lib/departments';
import { color } from '../lib/theme';
import { f, Input, Segmented, Sheet } from './form';
import { Pressable, Text } from './Text';

type Tab = 'current' | 'legacy';
const TAB_KO: Record<Tab, string> = { current: '현재 학과·전공', legacy: '개편 전 학과·전공' };

/** year: 입학연도(추천 정렬용, 모르면 null) */
export function DeptPicker({ value, onChange, year, title = '주전공' }: {
  value: string; onChange: (name: string) => void; year: number | null; title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[f.box, f.select]}>
        <Text style={[f.input, !value && { color: color.placeholder }]} numberOfLines={1}>{value || '학과·전공을 골라 주세요'}</Text>
        <Feather name="chevron-down" size={20} color={color.title} />
      </Pressable>
      {open && <DeptSheet value={value} year={year} title={title} onClose={() => setOpen(false)} onPick={(n) => { onChange(n); setOpen(false); }} />}
    </>
  );
}

function DeptSheet({ value, year, title, onPick, onClose }: {
  value: string; year: number | null; title: string; onPick: (name: string) => void; onClose: () => void;
}) {
  // 처음 탭: 지금 값이 있는 쪽, 없으면 2025학번부터 현재·그 전은 개편 전
  const [tab, setTab] = useState<Tab>(LEGACY_DEPTS.some((d) => d.name === value) || (!value && year !== null && year < 2025) ? 'legacy' : 'current');
  const [q, setQ] = useState('');
  const word = q.trim();
  const list = (tab === 'current' ? CURRENT_DEPTS : LEGACY_DEPTS).filter((d) => !word || d.name.includes(word) || !!d.parent?.includes(word));
  const rec = list.filter((d) => recommended(d, year));
  const rows: [Dept, boolean][] = [...rec.map((d): [Dept, boolean] => [d, true]), ...list.filter((d) => !rec.includes(d)).map((d): [Dept, boolean] => [d, false])];
  return (
    <Sheet visible onClose={onClose} title={title} sub={year ? `${year}학번에 맞는 학과를 위에 보여 드려요` : undefined}>
      <Segmented value={tab} items={['current', 'legacy']} label={(t) => TAB_KO[t]} onChange={setTab} />
      <Input value={q} onChangeText={setQ} placeholder="학과·전공 이름 검색" />
      <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
        {rows.length === 0 && <Text style={st.empty}>{tab === 'current' ? '개편 전 학과·전공에서 찾아보세요.' : '현재 학과·전공에서 찾아보세요.'}</Text>}
        {rows.map(([d, isRec]) => (
          <Pressable key={d.name} style={f.option} onPress={() => onPick(d.name)}>
            <View style={{ flex: 1 }}>
              <Text style={[f.optionText, d.name === value && { color: color.primary, fontWeight: '800' }]}>{d.name}</Text>
              {!!d.parent && <Text style={st.parent}>{d.parent}</Text>}
            </View>
            {isRec && <Text style={st.rec}>추천</Text>}
            {d.name === value && <Feather name="check" size={18} color={color.primary} />}
          </Pressable>
        ))}
      </ScrollView>
    </Sheet>
  );
}

/** 복수/부전공: [없음 | 복수전공 | 부전공] + 학과 고르기. 저장 값은 '없음' 또는 '학과 (복수전공)' */
export function MinorPicker({ value, onChange, year }: { value: string; onChange: (minor: string) => void; year: number | null }) {
  const m = value.match(/^(.+) \((복수전공|부전공)\)$/);
  const [kind, setKind] = useState<'없음' | '복수전공' | '부전공'>(m ? (m[2] as '복수전공' | '부전공') : '없음');
  const name = m?.[1] ?? '';
  return (
    <>
      <Segmented value={kind} items={['없음', '복수전공', '부전공']}
        onChange={(k) => {
          setKind(k);
          onChange(k === '없음' || !name ? '없음' : `${name} (${k})`);
        }} />
      {kind !== '없음' && <DeptPicker value={name} year={year} title={kind} onChange={(n) => onChange(`${n} (${kind})`)} />}
    </>
  );
}

const st = StyleSheet.create({
  parent: { fontSize: 12, color: color.inkSub, marginTop: 2 },
  rec: { fontSize: 11, fontWeight: '800', color: color.primary, backgroundColor: color.primarySoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden', marginRight: 6 },
  empty: { textAlign: 'center', color: color.inkSub, paddingVertical: 24 },
});
