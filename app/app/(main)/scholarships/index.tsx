// 시안 12 장학금 내역: 신청 완료 / 미신청 요약 + 카드. 비서 판정(신청 가능·확인 필요·조건 미충족)을 함께 보여 줌.
import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen, StateView, VERDICT_KO } from '../../../components/ui';
import { useApi } from '../../../lib/api';
import { deadlineText, dotDate } from '../../../lib/format';
import { color } from '../../../lib/theme';
import type { Scholarship } from '../../../lib/types';

export default function Scholarships() {
  const { data, error, loading, reload } = useApi<Scholarship[]>('/scholarships');
  const list = data ?? [];
  const applied = list.filter((s) => s.applied).length;
  const open = list.filter((s) => !s.applied && s.verdict !== 'ineligible').length;

  return (
    <Screen>
      <Stack.Screen options={{ title: '장학금 내역' }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={[st.chip, { backgroundColor: color.primarySoft }]}><Text style={[st.chipText, { color: color.primary }]}>✓ 신청 완료 {applied}건</Text></View>
        <View style={[st.chip, { backgroundColor: color.warmSoft }]}><Text style={[st.chipText, { color: color.alert }]}>! 미신청/신청가능 {open}건</Text></View>
      </View>
      <StateView loading={loading} error={error} empty={!list.length} emptyText="지금 모집 중인 장학 공지가 없어요" onRetry={reload}>
        {list.map((s) => {
          const done = s.applied;
          const off = !done && s.verdict === 'ineligible';
          const tone = done ? color.primary : off ? color.inkSub : color.alert;
          return (
            <Pressable key={s.notice_id} onPress={() => router.push(`/notices/${s.notice_id}`)}
              style={[st.card, { borderColor: tone, backgroundColor: done ? color.primarySoft : off ? color.surface : color.warmSoft }]}>
              <View style={st.row}>
                <Text style={[st.badge, { backgroundColor: tone }]}>{done ? '신청 완료' : off ? '조건 미충족' : '미신청'}</Text>
                {!done && !off && <Text style={[st.verdict, { color: s.verdict === 'eligible' ? color.primary : color.warn }]}>{VERDICT_KO[s.verdict]}</Text>}
              </View>
              <Text style={st.title}>{s.title.replace(/ 안내$/, '')}</Text>
              <Text style={[st.sub, { color: tone }]}>
                {done ? `${dotDate(s.applied_at!)} 신청 완료` : `마감: ${deadlineText(s.deadline)}`}
              </Text>
            </Pressable>
          );
        })}
      </StateView>
    </Screen>
  );
}

const st = StyleSheet.create({
  chip: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  chipText: { fontWeight: '800', fontSize: 13 },
  card: { borderWidth: 1.2, borderRadius: 16, padding: 14, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { color: '#fff', fontSize: 11, fontWeight: '800', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  verdict: { fontSize: 12, fontWeight: '800' },
  title: { fontSize: 17, fontWeight: '800', color: color.ink },
  sub: { fontSize: 13, fontWeight: '700' },
});
