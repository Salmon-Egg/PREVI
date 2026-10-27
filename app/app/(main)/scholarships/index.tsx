// ▶ FE 24번에 해당하는 부분: S-1 나에게 맞는 장학금 (새 시안 '장학금 내역')
// 위 두 버튼: [✓ 신청 완료 n건] → S-3 신청 내역(FE 26번) / [! 미신청/신청가능 n건] → 미신청만 보기(다시 누르면 전체)
// 카드: 상태 배지(신청 완료 · 미신청 · 조건 미충족) + 장학금 이름 + 신청일 또는 마감. 누르면 장학금 안내(S-2). 판정 근거는 안내 화면에
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../../../components/Text';
import { Screen, StateView } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { deadlineText, dotDate } from '../../../lib/format';
import { color, gradient, gradientBg } from '../../../lib/theme';
import type { Scholarship } from '../../../lib/types';

/** 미신청 카드 색: 오늘 마감이면 빨강, 아니면 주황 (시안) */
function tone(s: Scholarship) {
  if (s.applied) return { badge: '신청 완료', bg: '#E1F3E8', fg: color.primary, sub: color.inkSub };
  if (s.verdict === 'ineligible') return { badge: '조건 미충족', bg: color.surface, fg: color.inkSub, sub: color.inkSub };
  return deadlineText(s.deadline).startsWith('오늘')
    ? { badge: '미신청', bg: color.redSoft, fg: color.red, sub: color.red }
    : { badge: '미신청', bg: '#FDF0D3', fg: '#B7791F', sub: '#B7791F' };
}

export default function Scholarships() {
  const { data, error, loading, reload } = useApi<Scholarship[]>('/scholarships');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const all = data ?? [];
  const applied = all.filter((s) => s.applied).length;
  const isOpen = (s: Scholarship) => !s.applied && s.verdict !== 'ineligible';
  // 신청 완료 → 미신청 → 조건 미충족 순
  const rank = (s: Scholarship) => (s.applied ? 0 : isOpen(s) ? 1 : 2);
  const list = all.filter((s) => !onlyOpen || isOpen(s)).sort((a, b) => rank(a) - rank(b));

  return (
    <Screen title="장학금 내역">
      <View style={st.tabs}>
        {/* ▶ FE 26번에 해당하는 부분: '신청 완료'를 누르면 S-3 신청 내역 */}
        <Pressable style={[st.tab, gradientBg(gradient.primary, color.primary)]} onPress={() => router.push('/scholarships/applications')}>
          <Text style={[st.tabText, { color: '#fff' }]}>✓ 신청 완료 {applied}건</Text>
        </Pressable>
        <Pressable style={[st.tab, st.tabOff, onlyOpen && st.tabPicked]} onPress={() => setOnlyOpen(!onlyOpen)}>
          <Text style={[st.tabText, { color: color.title }]}>! 미신청/신청가능 {all.filter(isOpen).length}건</Text>
        </Pressable>
      </View>
      <StateView loading={loading} error={error} empty={!list.length} emptyText={onlyOpen ? '신청할 장학금이 없어요' : '지금 모집 중인 장학 공지가 없어요'} onRetry={reload}>
        {list.map((s) => {
          const t = tone(s);
          return (
            <Pressable key={s.notice_id} onPress={() => router.push(`/notices/${s.notice_id}`)} style={({ pressed }) => [st.card, pressed && { opacity: 0.7 }]}>
              <View style={[st.badge, { backgroundColor: t.bg }]}><Text style={[st.badgeText, { color: t.fg }]}>{t.badge}</Text></View>
              <Text style={st.title}>{s.title.replace(/ 안내$/, '')}</Text>
              <Text style={[st.sub, { color: t.sub }]}>
                {s.applied ? `${dotDate(s.applied_at!)} 신청 완료` : `마감: ${deadlineText(s.deadline)}`}
              </Text>
            </Pressable>
          );
        })}
      </StateView>
    </Screen>
  );
}

const st = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  tab: { flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  tabOff: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#B9D9C6' },
  tabPicked: { borderColor: color.primaryLight, backgroundColor: '#EEF8F2' },
  tabText: { fontWeight: '800', fontSize: 14 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: color.field, borderRadius: 18, padding: 16, gap: 7 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  title: { fontSize: 17, fontWeight: '800', color: color.ink },
  sub: { fontSize: 13, fontWeight: '600' },
});
