// ▶ FE 20번에 해당하는 부분: L-1 내 학업 메인 — 졸업 요건 요약 + 시간표(FE 22번)·성적 조회(FE 23번)로 가는 칸 + 영역별 이수 학점
// 새 시안은 시간표·성적 조회가 각각 한 화면이라 탭 대신 칸을 눌러 들어감
import { Feather } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AreaCard } from '../../../components/AreaCard';
import { Text } from '../../../components/Text';
import { Screen, StateView, Title } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { semesterLabel } from '../../../lib/format';
import { color, gradient, gradientBg } from '../../../lib/theme';
import type { Graduation } from '../../../lib/types';

const LINKS: { icon: keyof typeof Feather.glyphMap; title: string; sub: string; href: Href }[] = [
  { icon: 'calendar', title: '시간표', sub: `${semesterLabel()} · 수강 과목 편집`, href: '/study/timetable' },
  { icon: 'bar-chart-2', title: '성적 조회', sub: '학기별 성적 · 성적 수정', href: '/study/grades' },
];

export default function Study() {
  const grad = useApi<Graduation>('/graduation');
  const g = grad.data;

  return (
    <Screen title="내 학업">
      <StateView loading={grad.loading} error={grad.error} empty={!g} onRetry={grad.reload}>
        {g && (
          <>
            <Pressable onPress={() => router.push('/study/graduation')} style={[st.summary, gradientBg(gradient.primary, color.primary)]}>
              <Text style={st.sumLabel}>졸업까지 남은 학점</Text>
              <Text style={st.big}>{g.remaining_total === null ? '확인 필요' : `${g.remaining_total}학점`}</Text>
              <Text style={st.sumLabel}>{g.earned_total ?? '?'} / {g.required_total} · 남은 요건 {g.requirements.filter((r) => !r.done).length}가지 ›</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {LINKS.map((l) => (
                <Pressable key={l.title} style={({ pressed }) => [st.link, pressed && { opacity: 0.7 }]} onPress={() => router.push(l.href)}>
                  <View style={st.linkIcon}><Feather name={l.icon} size={20} color={color.primary} /></View>
                  <Text style={st.linkTitle}>{l.title}</Text>
                  <Text style={st.linkSub}>{l.sub}</Text>
                </Pressable>
              ))}
            </View>
            {/* ▶ FE 20번에 해당하는 부분: 영역별 이수 학점 — ⌄를 누르면 그 영역에서 들은 과목과 성적 */}
            <Title>영역별 이수 현황</Title>
            {g.areas.map((a) => <AreaCard key={a.name} area={a} />)}
          </>
        )}
      </StateView>
    </Screen>
  );
}

const st = StyleSheet.create({
  summary: { borderRadius: 20, padding: 18, gap: 4 },
  sumLabel: { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  big: { fontSize: 30, fontWeight: '900', color: '#fff' },
  link: { flex: 1, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: color.field, padding: 14, gap: 6 },
  linkIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E6F4EC', alignItems: 'center', justifyContent: 'center' },
  linkTitle: { fontSize: 16, fontWeight: '800', color: color.ink },
  linkSub: { fontSize: 12, color: color.inkSub },
});
