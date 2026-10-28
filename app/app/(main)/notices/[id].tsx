// ▶ FE 25번에 해당하는 부분: S-2 장학 공지 상세 (AI 요약, 판정, 원문 링크, 신청 완료 체크) — A-1(FE 27번) 공지 상세도 같이 씀
// 새 시안 '장학금 안내': 흰 창(🎓 장학금 안내 ✕) 안의 공지 칸에 제목 → AI 핵심 요약(마감·판정 근거) → 원문 → AI 요약 유의사항,
// 창 아래 [📢 공지사항 가기 | ☑️ 신청 완료 체크]. ✕를 누르면 들어오기 전 화면으로
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CloseButton } from '../../../components/form';
import { Text } from '../../../components/Text';
import { Button, goBack, isSafeUrl, openLink, Screen, StateView } from '../../../components/ui';
import { api, attempt, useApi } from '../../../lib/api';
import { askChat } from '../../../lib/chatStore';
import { deadlineText, dotDate } from '../../../lib/format';
import { color } from '../../../lib/theme';
import type { NoticeDetail } from '../../../lib/types';

const VERDICT = { eligible: '✅ 나의 판정: 신청 가능', check: '⚠️ 나의 판정: 확인 필요', ineligible: '⛔ 나의 판정: 조건 미충족' };

export default function Notice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: n, error, loading, reload } = useApi<NoticeDetail>(`/notices/${id}`);
  const isScholarship = n?.category === '장학';
  const summary = n?.summary ?? [];
  const name = isScholarship ? '장학금 안내' : '공지 안내';

  async function markApplied() {
    if (!n?.todo_id) return;
    // 서버가 신청 내역에 기록
    if (await attempt(() => api.patch(`/todos/${n.todo_id}`, { done: true }))) reload();
  }

  return (
    <Screen title={name} scroll={false} gap={0}>
      <StateView loading={loading} error={error} empty={!n} onRetry={reload}>
        {n && (
          <View style={st.sheet}>
            <View style={st.head}>
              <Text style={st.headIcon}>{isScholarship ? '🎓' : '📢'}</Text>
              <Text style={st.headTitle}>{name}</Text>
              <CloseButton onPress={goBack} />
            </View>
            <ScrollView contentContainerStyle={st.body}>
              {/* [학사]·[장학] 공지 칸 하나에: 제목 → AI 핵심 요약 → 원문 → 유의사항 */}
              <View style={st.article}>
                <Text style={st.title}>[{n.category ?? '공지'}] {n.title}</Text>
                <Text style={st.meta}>작성일 : {n.posted_at ? dotDate(n.posted_at) : '-'} | 작성자 : 학교 공지</Text>
                <View style={st.rule} />
                <View style={st.ai}>
                  <Text style={st.aiHead}>✨ AI 핵심 요약{n.deadline ? <Text style={{ color: color.red }}>   ⏰ {deadlineText(n.deadline).replace('!', '')}</Text> : null}</Text>
                  {summary.map((l) => <Text key={l} style={st.aiLine}>{l}</Text>)}
                  {/* 나의 판정과 근거 (요약에 이미 있는 근거는 빼고) */}
                  {n.eligibility && (
                    <Text style={st.verdict}>
                      {VERDICT[n.eligibility.verdict]}{n.eligibility.reasons.filter((r) => !summary.includes(r)).map((r) => ` · ${r}`).join('')}
                    </Text>
                  )}
                </View>
                {/* 서버(GET /notices/{id})는 아직 원문(body)을 안 줌 → 있을 때만 */}
                {!!n.body && <Text style={st.text}>{n.body}</Text>}
                <View style={st.caution}>
                  <Text style={st.cautionHead}>⚠️ AI 요약 정보 유의사항</Text>
                  <Text style={st.cautionText}>본 요약은 공지 원문을 바탕으로 생성되었습니다.{'\n'}실제 신청 전 학교의 전체 공지사항을 반드시 확인해주세요.</Text>
                </View>
              </View>
            </ScrollView>
            <View style={st.bottom}>
              <View style={{ flex: 1 }}>
                <Button compact kind="ghost" label="📢 공지사항 가기" onPress={() => (isSafeUrl(n.url) ? openLink(n.url) : router.push('/office'))} />
              </View>
              <View style={{ flex: 1 }}>
                {n.applied ? (
                  <Button compact kind="ghost" label="✅ 신청 완료" disabled onPress={() => {}} />
                ) : n.todo_id ? (
                  <Button compact label="☑️ 신청 완료 체크" onPress={markApplied} />
                ) : (
                  <Button compact label="💬 프리비에게 묻기"
                    onPress={() => askChat('이 공지 나도 해당돼?', { kind: 'notice', id: n.id })} />
                )}
              </View>
            </View>
          </View>
        )}
      </StateView>
    </Screen>
  );
}

const st = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#fff', borderRadius: 24, margin: -6, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: color.line },
  headIcon: { fontSize: 18 },
  headTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: color.title },
  body: { padding: 12, gap: 12 },
  ai: { backgroundColor: '#E6F4EC', borderWidth: 1, borderColor: color.field, borderRadius: 14, padding: 14, gap: 6, marginBottom: 6 },
  aiHead: { fontSize: 13, fontWeight: '800', color: color.title },
  aiLine: { fontSize: 13, color: color.ink, lineHeight: 19 },
  verdict: { fontSize: 13, color: color.title, fontWeight: '700', lineHeight: 19 },
  article: { backgroundColor: '#F4FAF6', borderWidth: 1, borderColor: color.field, borderRadius: 16, padding: 16, gap: 6 },
  title: { fontSize: 17, fontWeight: '800', color: color.title, lineHeight: 24 },
  meta: { fontSize: 12, color: color.inkSub },
  rule: { height: 1, backgroundColor: color.field, marginVertical: 6 },
  text: { fontSize: 14, color: color.ink, lineHeight: 22 },
  caution: { marginTop: 12, backgroundColor: '#FFF6EA', borderWidth: 1, borderColor: '#F3C98B', borderRadius: 12, padding: 12, gap: 4 },
  cautionHead: { fontSize: 13, fontWeight: '800', color: '#B4630B' },
  cautionText: { fontSize: 12, color: color.ink, lineHeight: 18 },
  bottom: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderColor: color.line },
});
