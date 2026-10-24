// ▶ FE 28번에 해당하는 부분: A-2 학사 일정 (내 학년에 해당하는 일정을 달력 + 목록으로)
// 홈의 '다음 일정' 카드, 알림(type=calendar)이 이 화면을 엶
import { Feather } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Card, Row, Screen, StateView, Sub } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { color } from '../../../lib/theme';
import type { CalendarEvent } from '../../../lib/types';

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 그날에 걸친 일정들 (시작~끝 사이) */
function eventsOn(day: string, events: CalendarEvent[]) {
  return events.filter((e) => e.start_date <= day && day <= (e.end_date ?? e.start_date));
}

export default function Calendar() {
  const { data, error, loading, reload } = useApi<CalendarEvent[]>('/calendar');
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [picked, setPicked] = useState<string | null>(null);
  const events = data ?? [];
  const today = ymd(new Date());

  // 달력 칸: 첫 주 앞쪽 빈칸 + 그 달 날짜
  const first = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => ymd(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  while (cells.length % 7) cells.push(null);

  const monthKey = ymd(month).slice(0, 7);
  const list = picked ? eventsOn(picked, events)
    : events.filter((e) => e.start_date.slice(0, 7) === monthKey || (e.end_date ?? '').slice(0, 7) === monthKey);
  const move = (n: number) => { setPicked(null); setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1)); };

  return (
    <Screen>
      <Stack.Screen options={{ title: '학사 일정' }} />
      <StateView loading={loading} error={error} empty={false} onRetry={reload}>
        <View style={st.cal}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Pressable accessibilityLabel="이전 달" onPress={() => move(-1)} style={st.nav}><Feather name="chevron-left" size={20} color={color.ink} /></Pressable>
            <Text style={st.month}>{month.getFullYear()}년 {month.getMonth() + 1}월</Text>
            <Pressable accessibilityLabel="다음 달" onPress={() => move(1)} style={st.nav}><Feather name="chevron-right" size={20} color={color.ink} /></Pressable>
          </Row>
          <View style={st.grid}>
            {WEEK.map((w, i) => <Text key={w} style={[st.week, i === 0 && { color: color.alert }]}>{w}</Text>)}
            {cells.map((c, i) => {
              const has = c ? eventsOn(c, events).length > 0 : false;
              const on = c === picked;
              return (
                <Pressable key={i} style={st.cell} disabled={!c} onPress={() => setPicked(on ? null : c)}>
                  {c && (
                    <View style={[st.day, c === today && st.today, on && st.picked]}>
                      <Text style={[st.dayText, on && { color: '#fff' }, i % 7 === 0 && !on && { color: color.alert }]}>{Number(c.slice(8))}</Text>
                    </View>
                  )}
                  {has && <View style={[st.mark, on && { backgroundColor: color.primary }]} />}
                </Pressable>
              );
            })}
          </View>
        </View>

        <Sub>{picked ? `${picked} 일정` : `${month.getMonth() + 1}월 일정`} · 내 학년에 해당하는 것만 보여요</Sub>
        {list.length === 0 && <Sub>일정이 없어요</Sub>}
        {list.map((e) => (
          <Card key={e.id} style={e.d_day < 0 ? { opacity: 0.5 } : undefined}>
            <Row>
              <Badge label={e.d_day < 0 ? '지남' : e.d_day === 0 ? '오늘' : `D-${e.d_day}`} tone={e.d_day >= 0 && e.d_day <= 3 ? 'strong' : 'soft'} />
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: color.ink }}>{e.title}</Text>
            </Row>
            <Sub>{e.start_date}{e.end_date && e.end_date !== e.start_date ? ` ~ ${e.end_date}` : ''}{e.description ? ` · ${e.description}` : ''}</Sub>
          </Card>
        ))}
      </StateView>
    </Screen>
  );
}

const st = StyleSheet.create({
  cal: { borderWidth: 1, borderColor: color.line, borderRadius: 18, padding: 12, gap: 8 },
  nav: { padding: 6 },
  month: { fontSize: 17, fontWeight: '800', color: color.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  week: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, color: color.inkSub, paddingVertical: 4 },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3, height: 44 },
  day: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1.5, borderColor: color.primaryLight },
  picked: { backgroundColor: color.primary },
  dayText: { fontSize: 14, color: color.ink, fontWeight: '600' },
  mark: { width: 5, height: 5, borderRadius: 3, backgroundColor: color.primaryLight, marginTop: 1 },
});
