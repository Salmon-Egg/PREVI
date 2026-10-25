// ▶ FE 20번에 해당하는 부분: L-1 내 학업 메인 (졸업 요건 요약 + 졸업/시간표(FE 22번)/성적(FE 23번) 탭)
// L-1 내 학업: 졸업 요건 요약 + 탭 [졸업 | 시간표(시안 02) | 성적(시안 09)]
import { Feather } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AreaCard } from '../../../components/AreaCard';
import { GradesView } from '../../../components/GradesView';
import { TimetableGrid } from '../../../components/TimetableGrid';
import { Card, Row, Screen, StateView, Sub } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { semesterLabel } from '../../../lib/format';
import { color } from '../../../lib/theme';
import type { Graduation, TimetableEntry } from '../../../lib/types';

const TABS = ['졸업', '시간표', '성적'] as const;

export default function Study() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('졸업');
  const grad = useApi<Graduation>('/graduation');

  return (
    <Screen>
      <Stack.Screen options={{ title: '내 학업' }} />
      <StateView loading={grad.loading} error={grad.error} empty={!grad.data} onRetry={grad.reload}>
        {grad.data && (
          <Card onPress={() => router.push('/study/graduation')} style={{ backgroundColor: color.primarySoft, borderWidth: 0 }}>
            <Sub>졸업까지 남은 학점</Sub>
            <Text style={{ fontSize: 28, fontWeight: '800', color: color.primary }}>{grad.data.remaining_total}학점</Text>
            <Sub>{grad.data.earned_total} / {grad.data.required_total} · 남은 요건 {grad.data.requirements.filter((r) => !r.done).length}가지 ›</Sub>
          </Card>
        )}
      </StateView>

      <View style={st.tabs}>
        {TABS.map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[st.tab, tab === t && st.tabOn]}>
            <Text style={[st.tabText, tab === t && { color: color.ink }]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {/* ▶ FE 20번에 해당하는 부분: 영역별 이수 학점 — ⌄를 누르면 그 영역에서 들은 과목과 성적 */}
      {tab === '졸업' && grad.data?.areas.map((a) => <AreaCard key={a.name} area={a} />)}
      {tab === '시간표' && <Timetable />}
      {tab === '성적' && <GradesView />}
    </Screen>
  );
}

/** 시안 02: 학기 제목 + 연필(편집) + 주간 표 */
function Timetable() {
  const { data, error, loading, reload } = useApi<TimetableEntry[]>('/timetable');
  return (
    <StateView loading={loading} error={error} empty={!data} onRetry={reload}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={st.sectionTitle}>{semesterLabel()} 시간표</Text>
        <Pressable accessibilityLabel="시간표 편집" onPress={() => router.push('/study/timetable-edit')}>
          <Feather name="edit-2" size={22} color={color.ink} />
        </Pressable>
      </Row>
      <TimetableGrid entries={data ?? []} />
    </StateView>
  );
}

const st = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: color.surface, borderRadius: 12, padding: 4 },
  tab: { flex: 1, padding: 8, borderRadius: 9 },
  tabOn: { backgroundColor: '#fff' },
  tabText: { textAlign: 'center', fontWeight: '700', color: color.inkSub },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: color.primary },
});
