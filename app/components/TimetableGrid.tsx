// ▶ FE 22번에 해당하는 부분: L-3 주간 시간표 표 (새 시안: 과목마다 다른 파스텔 색 칸, 연한 초록 요일 줄)
import { StyleSheet, View } from 'react-native';

import { CLASS_DAYS } from '../lib/constants';
import { color } from '../lib/theme';
import type { TimetableEntry } from '../lib/types';
import { Text } from './Text';

const ROW = 80; // 한 시간 높이
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// 과목 칸 색 (바탕, 글자). 목록 순서대로 돌아가며 씀
const TONES = [
  { bg: '#D8F0E0', fg: '#17703F' },
  { bg: '#E6DDFB', fg: '#6A44BE' },
  { bg: '#D6E8FA', fg: '#2B62B0' },
  { bg: '#FFE2C7', fg: '#B9581A' },
  { bg: '#FBDCE6', fg: '#B23A68' },
  { bg: '#F6EDC2', fg: '#8A6A0A' },
];

export function TimetableGrid({ entries }: { entries: TimetableEntry[] }) {
  const ends = entries.flatMap((e) => e.times.map((t) => toMin(t.end)));
  const last = Math.max(18, Math.ceil(Math.max(0, ...ends) / 60)); // 최소 18시까지
  const hours = Array.from({ length: last - 9 }, (_, i) => 9 + i);

  return (
    <View>
      <View style={g.head}>
        <Text style={[g.headText, g.timeCol]}>시</Text>
        {CLASS_DAYS.map((d) => <Text key={d} style={[g.headText, { flex: 1 }]}>{d}</Text>)}
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View style={g.timeCol}>
          {hours.map((h) => <Text key={h} style={g.hour}>{String(h).padStart(2, '0')}</Text>)}
        </View>
        {CLASS_DAYS.map((day) => (
          <View key={day} style={[g.dayCol, { height: hours.length * ROW }]}>
            {hours.map((h) => <View key={h} style={g.cell} />)}
            {entries.flatMap((e, i) =>
              e.times.filter((t) => t.day === day).map((t) => {
                const tone = TONES[i % TONES.length];
                const top = ((toMin(t.start) - 540) / 60) * ROW;
                const height = ((toMin(t.end) - toMin(t.start)) / 60) * ROW;
                return (
                  <View key={`${e.id}-${t.start}`} style={[g.block, { top: top + 3, height: height - 6, backgroundColor: tone.bg }]}>
                    <Text style={[g.name, { color: tone.fg }]} numberOfLines={height > 90 ? 3 : 2}>{e.course_name}</Text>
                    {!!e.room && <Text style={[g.room, { color: tone.fg }]} numberOfLines={1}>{e.room}</Text>}
                    {!!e.professor && height > 120 && <Text style={[g.room, { color: tone.fg }]} numberOfLines={1}>{e.professor}</Text>}
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
  head: { flexDirection: 'row', backgroundColor: '#E2F2E8', paddingVertical: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  headText: { textAlign: 'center', fontWeight: '800', color: color.title, fontSize: 14 },
  timeCol: { width: 36 },
  hour: { height: ROW, paddingTop: 8, textAlign: 'center', fontSize: 12, color: color.inkSub },
  dayCol: { flex: 1, borderLeftWidth: 1, borderColor: '#E3ECE6' },
  cell: { height: ROW, borderBottomWidth: 1, borderColor: '#E3ECE6' },
  block: { position: 'absolute', left: 3, right: 3, borderRadius: 10, padding: 6, overflow: 'hidden' },
  name: { fontSize: 12, fontWeight: '800', lineHeight: 16 },
  room: { fontSize: 10, marginTop: 6, opacity: 0.85 },
});
