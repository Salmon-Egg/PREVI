// ▶ FE 20번·21번에 해당하는 부분: 졸업 영역(전공 필수·전공 선택·교양 필수·교양 선택) 카드
// 이수 학점 오른쪽 ⌄를 누르면 그 영역에서 들은 과목과 받은 성적이 펼쳐짐.
// 성적 조회는 '학기별'로, 여기는 '이수 영역별'로 모아 보여 줌 (같은 성적 기록을 다르게 묶은 것)
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './Text';
import { overall, termLabel } from '../lib/format';
import { color } from '../lib/theme';
import type { Graduation } from '../lib/types';

type Area = Graduation['areas'][number];

export function AreaCard({ area, bar = false }: { area: Area; bar?: boolean }) {
  const [open, setOpen] = useState(false);
  // earned가 null = 서버가 확정 못 함 → '확인 필요'
  const earned = area.earned;
  const done = earned !== null && earned >= area.required;
  const pct = earned === null ? 0 : Math.min(1, earned / area.required);
  const courses = [...(area.courses ?? [])].sort((a, b) => a.term.localeCompare(b.term));
  // 이 영역 평점 (P·F 규칙은 성적 조회와 같음)
  const { gpa } = overall([{ term: '', gpa: null, items: courses.map((c, i) => ({ id: i, area: area.name, ...c })) }]);

  return (
    <View style={st.card}>
      <Pressable style={st.head} onPress={() => setOpen(!open)} accessibilityRole="button"
        accessibilityLabel={`${area.name} ${earned ?? '확인 필요'} / ${area.required}학점, 들은 과목 ${open ? '접기' : '펼치기'}`}>
        <Text style={st.name}>{area.name}</Text>
        <Text style={[st.credits, { color: done ? color.primary : color.alert }]}>
          {earned ?? '확인 필요'} / {area.required}{bar ? '학점' : ''}
        </Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={color.inkSub} />
      </Pressable>
      {bar && (
        <View style={st.track}>
          <View style={[st.fill, { width: `${pct * 100}%`, backgroundColor: done ? color.primary : color.alert }]} />
        </View>
      )}

      {open && (
        <View style={st.list}>
          {courses.length === 0 ? (
            <Text style={st.empty}>아직 이 영역에서 들은 과목이 없어요. 성적 조회에서 과목을 입력하면 여기에 모여요.</Text>
          ) : (
            <>
              {courses.map((c, i) => (
                <View key={`${c.term}-${c.course_name}-${i}`} style={st.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.course} numberOfLines={1}>{c.course_name}</Text>
                    <Text style={st.term}>{termLabel(c.term)} · {c.credits}학점</Text>
                  </View>
                  <Text style={[st.grade, c.grade === 'F' && { color: color.alert }]}>{c.grade}</Text>
                </View>
              ))}
              <Text style={st.sum}>
                {courses.length}과목 · {courses.filter((c) => c.grade !== 'F').reduce((n, c) => n + c.credits, 0)}학점
                {gpa !== null ? ` · 영역 평점 ${gpa.toFixed(2)}` : ''}
                {done || earned === null ? '' : ` · ${area.required - earned}학점 더 들어야 해요`}
              </Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderWidth: 1, borderColor: color.field, borderRadius: 18, padding: 15, gap: 8, backgroundColor: '#fff' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 15, color: color.ink },
  credits: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: 4, backgroundColor: color.surface, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  list: { borderTopWidth: 1, borderColor: color.line, paddingTop: 6, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  course: { fontSize: 14, fontWeight: '700', color: color.ink },
  term: { fontSize: 12, color: color.inkSub, marginTop: 1 },
  grade: { minWidth: 34, textAlign: 'center', fontSize: 14, fontWeight: '800', color: color.primary, backgroundColor: color.primarySoft, borderRadius: 8, paddingVertical: 3, overflow: 'hidden' },
  sum: { fontSize: 12, color: color.inkSub, marginTop: 4 },
  empty: { fontSize: 13, color: color.inkSub, paddingVertical: 6 },
});
