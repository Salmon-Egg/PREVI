// ▶ FE 23번에 해당하는 부분: L-8 성적 조회 / L-9 수정 모드 / L-10 성적 항목 추가·수정 창 (새 시안)
// 조회: 초록 요약 카드(전체 평점·총 취득학점) + 학기별 접기 카드 + '✏️ 성적 수정하기'
// 수정 모드: '성적 편집 중' 안내, 과목 옆 −(바로 삭제), 학기마다 '+ 과목 추가하기'(창), 과목을 누르면 고치기(창), '수정 완료하기'
// 저장하면 서버가 졸업 요건·장학 판정을 다시 계산해서 알려 줌
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api, ApiError, useApi, useSubmit } from '../lib/api';
import { overall, termLabel } from '../lib/format';
import { color, gradient, gradientBg } from '../lib/theme';
import type { GradeItem, GradeTerm, Graduation } from '../lib/types';
import { Input, Label, Select, Sheet } from './form';
import { Pressable, Text } from './Text';
import { Button, Screen, showAlert, StateView, Sub } from './ui';

const TERMS = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
const GRADES = ['A+', 'A0', 'B+', 'B0', 'C+', 'C0', 'D+', 'D0', 'F', 'P'];
const POINT: Record<string, string> = { 'A+': '4.5', A0: '4.0', 'B+': '3.5', B0: '3.0', 'C+': '2.5', C0: '2.0', 'D+': '1.5', D0: '1.0', F: '0', P: '통과' };
// 졸업 요건 영역과 같은 이름 (내 학업 › 졸업 요건에서 이 영역으로 묶여 보임)
const AREAS = ['전공 필수', '전공 선택', '교양 필수', '교양 선택'];

/** 성적 배지 색: A 초록, B 파랑, 그 밖 회색 (시안) */
const gradeTone = (g: string) => (g.startsWith('A') ? { bg: '#E1F3E8', fg: color.primary }
  : g.startsWith('B') ? { bg: '#E3EEFB', fg: '#2F65B8' } : { bg: color.surface, fg: color.inkSub });

type Draft = Partial<GradeItem> & { term: string };

export function GradesScreen({ editing = false }: { editing?: boolean }) {
  const { data, error, loading, reload, setData } = useApi<GradeTerm[]>('/grades');
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null); // 추가·수정 창에 띄운 과목
  const terms = [...(data ?? [])].reverse(); // 최근 학기가 위로
  const sum = overall(terms);
  const openTerm = open ?? terms[0]?.term; // 처음에는 가장 최근 학기를 펼침

  // 수정 모드에 들어왔을 때의 과목 목록 → '수정 완료하기'에서 추가·삭제 수를 알려 주려고 기억
  const [startIds, setStartIds] = useState<number[] | null>(null);
  const ids = terms.flatMap((t) => t.items.map((g) => g.id));
  if (editing && data && startIds === null) setStartIds(ids);
  const before = new Set(startIds ?? []);
  const now = new Set(ids);
  const added = startIds ? ids.filter((i) => !before.has(i)).length : 0;
  const removed = startIds ? startIds.filter((i) => !now.has(i)).length : 0;

  /** 누르는 즉시 목록에서 빼고 서버에서도 지움 (실패하면 다시 불러옴) */
  async function remove(id: number) {
    setData((data ?? []).map((t) => ({ ...t, items: t.items.filter((g) => g.id !== id) })).filter((t) => t.items.length));
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
        `${changed ? `${changed} · ` : ''}총 ${g.earned_total}학점 이수, 졸업까지 ${g.remaining_total}학점 남았어요.\n내 학업 › 졸업 요건의 영역별 과목에도 반영됐어요.`);
    } catch {}
    router.back();
  }

  return (
    <Screen title={editing ? '성적 수정 모드' : '성적 조회'}
      footer={editing
        ? <Button label="수정 완료하기" onPress={finish} />
        : <Button label="✏️ 성적 수정하기" onPress={() => router.push('/study/grades-edit')} />}>
      <StateView loading={loading} error={error} empty={!data} onRetry={reload}>
        {editing ? (
          <View style={st.editBanner}>
            <Text style={st.editTitle}>성적 편집 중</Text>
            <Sub>과목 삭제 또는 항목 추가 후 완료 버튼을 눌러주세요.</Sub>
            {(added > 0 || removed > 0) && (
              <Text style={st.changed}>이번에 바뀐 것: {[added && `추가 ${added}`, removed && `삭제 ${removed}`].filter(Boolean).join(' · ')} (총 {sum.earned}학점)</Text>
            )}
          </View>
        ) : (
          <View style={[st.summary, gradientBg(gradient.primary, color.primary)]}>
            <View style={{ flex: 1 }}>
              <Text style={st.sumLabel}>전체 평점 평균</Text>
              <Text style={st.big}>{sum.gpa ?? '-'} / 4.5</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.sumLabel}>총 취득학점</Text>
              <Text style={st.big}>{sum.earned} 학점</Text>
            </View>
          </View>
        )}
        {terms.length === 0 && <Sub>입력한 성적이 없어요</Sub>}
        {terms.map((t) => {
          const isOpen = t.term === openTerm;
          return (
            <View key={t.term} style={st.term}>
              <Pressable style={st.termHead} onPress={() => setOpen(isOpen ? '' : t.term)}>
                <Text style={st.termTitle}>{termLabel(t.term)}</Text>
                {!editing && isOpen && <Text style={st.termGpa}>{t.gpa ?? '-'} / 4.5</Text>}
                <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} color={color.ink} />
              </Pressable>
              {isOpen && t.items.map((g) => (
                <Pressable key={g.id} accessibilityRole={undefined} style={st.item} disabled={!editing} onPress={() => setDraft(g)}>
                  <Text style={st.itemName}>{g.course_name} ({g.credits}학점)</Text>
                  {editing ? (
                    <Pressable accessibilityLabel={`${g.course_name} 삭제`} hitSlop={6} onPress={() => remove(g.id)} style={st.minus}>
                      <View style={st.minusBar} />
                    </Pressable>
                  ) : (
                    <View style={[st.grade, { backgroundColor: gradeTone(g.grade).bg }]}>
                      <Text style={[st.gradeText, { color: gradeTone(g.grade).fg }]}>{g.grade}</Text>
                    </View>
                  )}
                </Pressable>
              ))}
              {isOpen && editing && (
                <Pressable style={st.addRow} onPress={() => setDraft({ term: t.term })}>
                  <Text style={st.addText}>+ 과목 추가하기</Text>
                </Pressable>
              )}
            </View>
          );
        })}
        {editing && terms.length === 0 && <Button label="+ 과목 추가하기" kind="ghost" onPress={() => setDraft({ term: '1-1' })} />}
      </StateView>
      {draft && <GradeSheet draft={draft} onClose={() => setDraft(null)} onSaved={reload} />}
    </Screen>
  );
}

type Recalc = { recalculated: { remaining_total: number | null; new_eligible_scholarships: number } };

/** ▶ FE 23번에 해당하는 부분: L-10 성적 항목 추가/수정 창 → 저장 후 졸업 요건·장학 판정 재계산 결과 표시 */
function GradeSheet({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [term, setTerm] = useState(draft.term);
  const [name, setName] = useState(draft.course_name ?? '');
  const [credits, setCredits] = useState(draft.credits ?? 3);
  const [grade, setGrade] = useState(draft.grade ?? 'A+');
  const [area, setArea] = useState(draft.area === '전공' ? '전공 선택' : draft.area ?? '전공 필수'); // 예전 값 '전공'은 전공 선택으로
  const { busy, run } = useSubmit(); // 두 번 눌러 같은 과목이 두 번 들어가지 않게

  const save = () => run(async () => {
    const body = { term, course_name: name.trim(), credits, grade, area };
    try {
      const res = draft.id ? await api.put<Recalc>(`/grades/${draft.id}`, body) : await api.post<Recalc>('/grades', body);
      const r = res.recalculated;
      const extra = r.new_eligible_scholarships ? `\n새로 신청할 수 있는 장학금 ${r.new_eligible_scholarships}개가 생겼어요!` : '';
      onClose();
      onSaved();
      showAlert(draft.id ? '성적을 고쳤어요' : '과목을 추가했어요', `[${body.course_name}] ${termLabel(term)} · ${area} · ${grade}\n다시 계산하면 졸업까지 ${r.remaining_total ?? '-'}학점 남았어요.${extra}`);
    } catch (e) {
      showAlert('저장 실패', (e as ApiError).message);
    }
  });

  return (
    <Sheet visible onClose={onClose} title="성적 항목 추가/수정">
      <Label>이수 학기</Label>
      <Select value={term} items={TERMS} label={termLabel} onChange={setTerm} title="이수 학기" />
      <Label>과목명</Label>
      <Input value={name} onChangeText={setName} placeholder="예: 모바일앱프로그래밍" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Label>학점 (이수 단위)</Label>
          <Select value={credits} items={[1, 2, 3, 4]} label={(v) => `${v} 학점`} onChange={setCredits} title="학점" />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Label>취득 성적</Label>
          <Select value={grade} items={GRADES} label={(v) => `${v} (${POINT[v]})`} onChange={setGrade} title="취득 성적" />
        </View>
      </View>
      <Label>이수 영역</Label>
      <Select value={area} items={AREAS} onChange={setArea} title="이수 영역" />
      <View style={st.tip}><Text style={st.tipText}>💡 직접 수정/입력한 성적은 졸업 학점 계산에 반영돼요.</Text></View>
      <Button label="저장하기" disabled={!name.trim() || busy} onPress={save} />
    </Sheet>
  );
}

const st = StyleSheet.create({
  summary: { flexDirection: 'row', borderRadius: 18, padding: 18 },
  sumLabel: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  big: { fontSize: 24, fontWeight: '900', color: '#fff', marginTop: 4 },
  editBanner: { backgroundColor: '#E6F4EC', borderWidth: 1, borderColor: color.field, borderRadius: 16, padding: 14, gap: 4 },
  editTitle: { color: color.title, fontWeight: '800', fontSize: 14 },
  changed: { color: color.primary, fontWeight: '700', marginTop: 2, fontSize: 13 },
  term: { backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 16, borderWidth: 1, borderColor: color.field },
  termHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16 },
  termTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: color.ink },
  termGpa: { fontSize: 13, fontWeight: '800', color: color.primary },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderTopWidth: 1, borderColor: color.line },
  itemName: { fontSize: 14, color: color.ink, flex: 1 },
  grade: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, minWidth: 44, alignItems: 'center' },
  gradeText: { fontWeight: '800', fontSize: 12 },
  minus: { width: 24, height: 24, borderRadius: 12, backgroundColor: color.redSoft, alignItems: 'center', justifyContent: 'center' },
  minusBar: { width: 10, height: 2, borderRadius: 1, backgroundColor: color.red },
  addRow: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#8FC7A6', borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 14, backgroundColor: '#F4FAF6' },
  addText: { color: color.title, fontWeight: '800' },
  tip: { backgroundColor: '#E6F4EC', borderRadius: 12, padding: 12, marginVertical: 4 },
  tipText: { fontSize: 13, color: color.title },
});
