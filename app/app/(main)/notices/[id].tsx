// 시안 13 장학금(공지) 안내: AI 핵심 요약 → 나의 판정 → 공지 원문 → AI 요약 유의사항 → 공지사항 가기 / 신청 완료 체크
import { Feather } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen, StateView, VerdictBadge } from '../../../components/ui';
import { api, useApi } from '../../../lib/api';
import { deadlineText, dotDate } from '../../../lib/format';
import { color } from '../../../lib/theme';
import type { NoticeDetail } from '../../../lib/types';

export default function Notice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: n, error, loading, reload } = useApi<NoticeDetail>(`/notices/${id}`);
  const isScholarship = n?.category === '장학';

  async function markApplied() {
    if (!n?.todo_id) return;
    await api.patch(`/todos/${n.todo_id}`, { done: true }); // 서버가 신청 내역에 기록
    reload();
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <Stack.Screen options={{ title: isScholarship ? '장학금 안내' : '공지 안내' }} />
      <Screen>
        <StateView loading={loading} error={error} empty={!n} onRetry={reload}>
          {n && (
            <View style={st.panel}>
              <View style={st.panelHead}>
                <Feather name="arrow-right-circle" size={22} color={color.primary} />
                <Text style={st.panelTitle}>{isScholarship ? '장학금 안내' : '공지 안내'}</Text>
              </View>

              <View style={st.ai}>
                <Text style={st.aiHead}>✨ AI 핵심 요약{n.deadline ? <Text style={{ color: color.alert }}>  ⏰ {deadlineText(n.deadline).replace('!', '')}</Text> : null}</Text>
                {n.summary.map((l) => <Text key={l} style={st.aiLine}>{l}</Text>)}
              </View>

              {n.eligibility && (
                <View style={st.verdict}>
                  <View style={st.row}><Text style={st.verdictHead}>나의 판정</Text><VerdictBadge verdict={n.eligibility.verdict} /></View>
                  {n.eligibility.reasons.map((r) => <Text key={r} style={st.reason}>· {r}</Text>)}
                </View>
              )}

              <View style={st.article}>
                <Text style={st.title}>[{n.category ?? '공지'}] {n.title}</Text>
                <Text style={st.meta}>작성일 : {n.posted_at ? dotDate(n.posted_at) : '-'} | 작성자 : 학교 공지</Text>
                <Text style={st.body}>{n.body}</Text>
              </View>

              <View style={st.caution}>
                <Text style={st.cautionHead}>⚠️ AI 요약 정보 유의사항</Text>
                <Text style={st.cautionText}>본 요약은 공지 원문을 바탕으로 생성되었습니다.{'\n'}실제 신청 전 학교의 전체 공지사항을 반드시 확인해주세요.</Text>
              </View>
            </View>
          )}
        </StateView>
      </Screen>

      {n && (
        <View style={st.bottom}>
          <Pressable style={[st.btn, st.btnGhost]} onPress={() => (n.url ? Linking.openURL(n.url) : router.push('/office'))}>
            <Text style={[st.btnText, { color: color.primary }]}>📢 공지사항 가기</Text>
          </Pressable>
          {n.applied ? (
            <View style={[st.btn, { backgroundColor: color.primarySoft }]}><Text style={[st.btnText, { color: color.primary }]}>✅ 신청 완료</Text></View>
          ) : n.todo_id ? (
            <Pressable style={st.btn} onPress={markApplied}><Text style={st.btnText}>☑️ 신청 완료 체크</Text></Pressable>
          ) : (
            <Pressable style={st.btn} onPress={() => router.push({ pathname: '/chat', params: { contextKind: 'notice', contextId: String(n.id), q: '이 공지 나도 해당돼?' } })}>
              <Text style={st.btnText}>💬 서경 AI에게 묻기</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  panel: { borderWidth: 1.5, borderColor: color.primary, borderRadius: 18, overflow: 'hidden' },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: color.primarySoft, padding: 14 },
  panelTitle: { fontSize: 17, fontWeight: '800', color: color.primary },
  ai: { margin: 12, borderWidth: 1.2, borderColor: color.alert, borderRadius: 12, padding: 12, gap: 4 },
  aiHead: { fontSize: 13, fontWeight: '800', color: color.primary },
  aiLine: { fontSize: 13, color: color.ink },
  verdict: { marginHorizontal: 12, backgroundColor: color.surface, borderRadius: 12, padding: 12, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  verdictHead: { fontSize: 13, fontWeight: '800', color: color.ink },
  reason: { fontSize: 13, color: color.ink },
  article: { padding: 16, gap: 6 },
  title: { fontSize: 18, fontWeight: '800', color: color.ink, lineHeight: 25 },
  meta: { fontSize: 12, color: color.inkSub },
  body: { fontSize: 14, color: color.ink, lineHeight: 22, marginTop: 8 },
  caution: { margin: 12, marginTop: 0, backgroundColor: color.warmSoft, borderWidth: 1, borderColor: color.alert, borderRadius: 12, padding: 12, gap: 4 },
  cautionHead: { fontSize: 13, fontWeight: '800', color: color.alert },
  cautionText: { fontSize: 12, color: color.ink, lineHeight: 18 },
  bottom: { flexDirection: 'row', gap: 8, padding: 16, borderTopWidth: 1, borderColor: color.line, backgroundColor: '#fff' },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 15, alignItems: 'center', backgroundColor: color.primary },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: color.primary },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
