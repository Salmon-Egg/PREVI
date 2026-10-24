// ▶ FE 22번에 해당하는 부분: L-3 주간 시간표 표
// 주간 시간표 표 (시안 02). 전공은 초록, 교양·일선은 주황.
import { StyleSheet, Text, View } from 'react-native';

import { color } from '../lib/theme';
import type { TimetableEntry } from '../lib/types';

const DAYS = ['월', '화', '수', '목', '금'];
const ROW = 56; // 한 시간 높이
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const isMajor = (category: string | null) => !category || category.startsWith('전');

export function TimetableGrid({ entries }: { entries: TimetableEntry[] }) {
  const ends = entries.flatMap((e) => e.times.map((t) => toMin(t.end)));
  const last = Math.max(18, Math.ceil(Math.max(0, ...ends) / 60)); // 최소 18시까지
  const hours = Array.from({ length: last - 9 }, (_, i) => 9 + i);

  return (
    <View>
      <View style={g.head}>
        <Text style={[g.headText, g.timeCol]}>시</Text>
        {DAYS.map((d) => <Text key={d} style={[g.headText, { flex: 1 }]}>{d}</Text>)}
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View style={g.timeCol}>
          {hours.map((h) => <Text key={h} style={g.hour}>{String(h).padStart(2, '0')}</Text>)}
        </View>
        {DAYS.map((day) => (
          <View key={day} style={[g.dayCol, { height: hours.length * ROW }]}>
            {hours.map((h) => <View key={h} style={g.cell} />)}
            {entries.flatMap((e) =>
              e.times.filter((t) => t.day === day).map((t) => {
                const major = isMajor(e.category);
                const top = ((toMin(t.start) - 540) / 60) * ROW;
                const height = ((toMin(t.end) - toMin(t.start)) / 60) * ROW;
                return (
                  <View key={`${e.id}-${t.start}`} style={[g.block, { top: top + 2, height: height - 4 },
                    major ? g.major : g.minor]}>
                    <Text style={[g.name, { color: major ? color.primary : color.alert }]} numberOfLines={3}>{e.course_name}</Text>
                    {!!e.room && <Text style={g.room} numberOfLines={1}>{e.room}</Text>}
                    {!!e.professor && height > 80 && <Text style={g.prof} numberOfLines={1}>{e.professor}</Text>}
                  </View>
                );
              }),
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const g = StyleSheet.create({
  head: { flexDirection: 'row', backgroundColor: color.surface, borderRadius: 16, paddingVertical: 12 },
  headText: { textAlign: 'center', fontWeight: '700', color: color.ink, fontSize: 14 },
  timeCol: { width: 36 },
  hour: { height: ROW, paddingTop: 6, textAlign: 'center', fontSize: 12, fontWeight: '700', color: color.inkSub },
  dayCol: { flex: 1, borderLeftWidth: 1, borderColor: color.line },
  cell: { height: ROW, borderBottomWidth: 1, borderColor: color.line },
  block: { position: 'absolute', left: 2, right: 2, borderRadius: 8, borderWidth: 1.2, padding: 5, overflow: 'hidden' },
  major: { backgroundColor: color.primarySoft, borderColor: color.primary },
  minor: { backgroundColor: color.warmSoft, borderColor: color.alert },
  name: { fontSize: 12, fontWeight: '800', lineHeight: 16 },
  room: { fontSize: 10, fontWeight: '700', color: color.ink, marginTop: 4 },
  prof: { fontSize: 10, color: color.inkSub },
});
