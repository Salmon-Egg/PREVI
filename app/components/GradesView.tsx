// ▶ FE 23번에 해당하는 부분: L-8 성적 조회 / L-9 수정 모드 공통 화면
// 성적 보기 (시안 09) / 수정 모드 (시안 10). 내 학업 탭과 성적 수정 화면이 같이 씀.
// 수정 모드: −를 누르면 바로 지워지고, '+ 과목 추가하기'로 넣은 과목은 돌아오자마자 목록에 보임.
// '수정 완료하기'를 누르면 이번에 바뀐 내용과 다시 계산한 졸업 학점을 알려 주고 돌아감
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, ApiError, useApi } from '../lib/api';
import { overall, termLabel } from '../lib/format';
import { color } from '../lib/theme';
import type { GradeTerm, Graduation } from '../lib/types';
import { Button, Row, showAlert, StateView, Sub } from './ui';

const gradeTone = (g: string) => (g.startsWith('A') ? { bg: color.primarySoft, fg: color.primary }
  : g.startsWith('B') ? { bg: color.warmSoft, fg: color.alert } : { bg: color.surface, fg: color.inkSub });

export function GradesView({ editing = false }: { editing?: boolean }) {
  const { data, error, loading, reload, setData } = useApi<GradeTerm[]>('/grades');
  const [open, setOpen] = useState<string | null>(null);
  const terms = data ?? [];
  const sum = overall(terms);
  const openTerm = open ?? terms[terms.length - 1]?.term; // 처음에는 가장 최근 학기를 펼침

  // 수정 모드에 들어왔을 때의 과목 목록 → '수정 완료하기'에서 추가·삭제 수를 알려 주려고 기억
  const [startIds, setStartIds] = useState<number[] | null>(null);
  const ids = terms.flatMap((t) => t.items.map((g) => g.id));
  if (editing && data && startIds === null) setStartIds(ids);
  const now = new Set(ids);
  const before = new Set(startIds ?? []);
  const added = startIds ? ids.filter((i) => !before.has(i)).length : 0;
  const removed = startIds ? startIds.filter((i) => !now.has(i)).length : 0;

  /** 누르는 즉시 목록에서 빼고 서버에서도 지움 (실패하면 다시 불러옴) */
  async function remove(id: number) {
    setData(terms.map((t) => ({ ...t, items: t.items.filter((g) => g.id !== id) })).filter((t) => t.items.length));
    try {
      await api.del(`/grades/${id}`);
    } catch (e) {
      showAlert('삭제 실패', (e as ApiError).message);
    }
    reload();
  }

  /** 다시 계산한 졸업 학점을 알려 주고 돌아감 */
  async function finish() {
    const changed = [added && `${added}과목 추가`, removed && `${removed}과목 삭제`].filter(Boolean).join(', ');
    try {
      const g = await api.get<Graduation>('/graduation');
      showAlert(changed ? '성적을 반영했어요' : '바뀐 성적이 없어요',
        `${changed ? `${changed} · ` : ''}총 ${g.earned_total}학점 이수, 졸업까지 ${g.remaining_total}학점 남았어요.\n내 학업 › 졸업 탭의 영역별 과목에도 반영됐어요.`);
    } catch {}
    router.back();
  }

  return (
    <StateView loading={loading} error={error} empty={!data} onRetry={reload}>
      {editing ? (
        <View style={st.editBanner}>
          <Text style={{ color: color.alert, fontWeight: '800' }}>✏️ 성적 편집 중</Text>
          <Sub>과목 삭제 또는 항목 추가 후 완료 버튼을 눌러주세요. 과목을 누르면 성적을 고칠 수 있어요.</Sub>
          {(added > 0 || removed > 0) && (
            <Text style={{ color: color.primary, fontWeight: '700', marginTop: 2 }}>
              이번에 바뀐 것: {[added && `추가 ${added}`, removed && `삭제 ${removed}`].filter(Boolean).join(' · ')} (총 {sum.earned}학점)
            </Text>
          )}
        </View>
      ) : (
        <View style={st.summary}>
          <View style={{ flex: 1 }}>
            <Sub>전체 평점 평균</Sub>
            <Text style={st.big}>{sum.gpa ?? '-'}<Text style={st.bigSub}> / 4.5</Text></Text>
          </View>
          <View style={{ flex: 1 }}>
            <Sub>총 취득학점</Sub>
            <Text style={st.big}>{sum.earned}<Text style={st.bigSub}> 학점</Text></Text>
          </View>
        </View>
      )}
      {terms.length === 0 && <Sub>입력한 성적이 없어요</Sub>}
      {terms.map((t) => {
        const isOpen = t.term === openTerm;
        return (
          <View key={t.term} style={[st.term, isOpen && st.termOpen]}>
            <Pressable style={st.termHead} onPress={() => setOpen(isOpen ? '' : t.term)}>
              <Text style={st.termTitle}>{termLabel(t.term)}</Text>
              <Row>
                {!editing && <Text style={st.termGpa}>{t.gpa ?? '-'} / 4.5</Text>}
                <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={color.inkSub} />
              </Row>
            </Pressable>
            {isOpen && t.items.map((g) => (
              <Pressable key={g.id} style={st.item} disabled={!editing}
                onPress={() => router.push({ pathname: '/study/grade-edit', params: { ...g, id: String(g.id), credits: String(g.credits) } })}>
                <Text style={st.itemName}>{g.course_name} ({g.credits}학점)</Text>
                {editing ? (
                  <Pressable accessibilityLabel={`${g.course_name} 삭제`} onPress={() => remove(g.id)} style={st.minus}>
                    <Text style={{ color: '#fff', fontWeight: '900' }}>−</Text>
                  </Pressable>
                ) : (
                  <View style={[st.grade, { backgroundColor: gradeTone(g.grade).bg }]}>
                    <Text style={{ color: gradeTone(g.grade).fg, fontWeight: '800', fontSize: 12 }}>{g.grade}</Text>
                  </View>
                )}
              </Pressable>
            ))}
            {isOpen && editing && (
              <Pressable style={st.addRow} onPress={() => router.push({ pathname: '/study/grade-edit', params: { term: t.term } })}>
                <Text style={{ color: color.primary, fontWeight: '700' }}>+ 과목 추가하기</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      {editing && terms.length === 0 && <Button label="+ 과목 추가하기" kind="ghost" onPress={() => router.push('/study/grade-edit')} />}
      {editing
        ? <Button label="수정 완료하기" onPress={finish} />
        : <Button label="✏️ 성적 수정하기" kind="ghost" onPress={() => router.push('/study/grades-edit')} />}
    </StateView>
  );
}

const st = StyleSheet.create({
  summary: { flexDirection: 'row', backgroundColor: color.primarySoft, borderRadius: 16, padding: 16 },
  big: { fontSize: 26, fontWeight: '900', color: color.primary },
  bigSub: { fontSize: 14, fontWeight: '600', color: color.inkSub },
  editBanner: { borderWidth: 1.5, borderColor: color.alert, backgroundColor: color.warmSoft, borderRadius: 14, padding: 14, gap: 4 },
  term: { backgroundColor: color.surface, borderRadius: 16, paddingHorizontal: 16, borderWidth: 1.5, borderColor: 'transparent' },
  termOpen: { backgroundColor: '#fff', borderColor: color.primary },
  termHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
  termTitle: { fontSize: 16, fontWeight: '800', color: color.ink },
  termGpa: { fontSize: 13, fontWeight: '700', color: color.primary },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderColor: color.line },
  itemName: { fontSize: 14, fontWeight: '600', color: color.ink, flex: 1 },
  grade: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  minus: { width: 22, height: 22, borderRadius: 11, backgroundColor: color.alert, alignItems: 'center', justifyContent: 'center' },
  addRow: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.primary, borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 14 },
});
