// ▶ FE 23번에 해당하는 부분: L-8 성적 조회 / L-9 수정 모드 / L-10 성적 항목 추가·수정 창 (새 시안)
// 조회: 초록 요약 카드(전체 평점·총 취득학점) + 학기별 접기 카드 + '✏️ 성적 수정하기'
// 수정 모드: '성적 편집 중' 안내, 과목 옆 −(바로 삭제), 증명서 입력 밑 '+ 과목 추가하기'(창), 과목을 누르면 고치기(창), '수정 완료하기'
// 저장하면 서버가 졸업 요건·장학 판정을 다시 계산해서 알려 줌
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api, ApiError, useApi, useSubmit } from '../lib/api';
import { overall, termLabel } from '../lib/format';
import { color, gradient, gradientBg } from '../lib/theme';
import { transcriptGroup, transcriptPayload } from '../lib/transcript';
import type { GradeItem, GradeTerm, Graduation, TranscriptItem } from '../lib/types';
import { Input, Label, Select, Sheet } from './form';
import { Pressable, Text } from './Text';
import { Button, confirmAsk, PicText, Screen, showAlert, StateView, Sub } from './ui';

const TERMS = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
const GRADES = ['A+', 'A0', 'B+', 'B0', 'C+', 'C0', 'D+', 'D0', 'F', 'P'];
const POINT: Record<string, string> = { 'A+': '4.5', A0: '4.0', 'B+': '3.5', B0: '3.0', 'C+': '2.5', C0: '2.0', 'D+': '1.5', D0: '1.0', F: '0', P: '통과' };
// 원문 이수구분을 보존하고 졸업 요건 계산에서 필요한 영역으로 따로 묶는다.
const AREAS = ['전공 필수', '전공 핵심', '전공 심화', '전공 기초', '전공 선택', '전공', '교양 필수', '교양 선택', '핵심역량교양필수', '기초학문교양선택', '자유 선택', '일반 선택'];

/** 성적 배지 색: A 초록, B 파랑, 그 밖 회색 (시안) */
const gradeTone = (g: string) => (g.startsWith('A') ? { bg: '#E1F3E8', fg: color.primary }
  : g.startsWith('B') ? { bg: '#E3EEFB', fg: '#2F65B8' } : { bg: color.surface, fg: color.inkSub });

type Draft = Partial<GradeItem> & { term: string };

export function GradesScreen({ editing = false }: { editing?: boolean }) {
  const { data, error, loading, reload, setData } = useApi<GradeTerm[]>('/grades');
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null); // 추가·수정 창에 띄운 과목
  const [picking, setPicking] = useState(false); // 성적증명서 고르는 창
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
  const [editedIds, setEditedIds] = useState<number[]>([]); // 창에서 고친 과목 → 지웠거나 이번에 추가한 과목은 '수정'으로 안 셈
  const edited = new Set(editedIds.filter((i) => before.has(i) && now.has(i))).size;
  const changedText = [added && `${added}과목 추가`, removed && `${removed}과목 삭제`, edited && `${edited}과목 수정`].filter(Boolean).join(', ');

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
    try {
      const g = await api.get<Graduation>('/graduation');
      showAlert(changedText ? '성적을 반영했어요' : '바뀐 성적이 없어요',
        `${changedText ? `${changedText} · ` : ''}총 ${g.earned_total}학점 이수, 졸업까지 ${g.remaining_total}학점 남았어요.\n내 학업 › 졸업 요건의 영역별 과목에도 반영됐어요.`);
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
            <Sub>과목을 눌러 고치거나, 삭제·추가한 뒤 완료 버튼을 눌러주세요.</Sub>
            {!!changedText && <Text style={st.changed}>이번에 바뀐 것: {changedText} (총 {sum.earned}학점)</Text>}
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
        <Button compact kind="ghost" label="📄 성적증명서로 한 번에 입력" onPress={() => confirmAsk('성적증명서 올리기 전 확인', TRANSCRIPT_WARNING, '동의하고 계속', () => setPicking(true))} />
        {editing && <Button compact kind="ghost" label="+ 과목 추가하기" onPress={() => setDraft({ term: openTerm || '1-1' })} />}
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
                <Pressable key={g.id} accessibilityRole={undefined} style={st.item} disabled={!editing} onPress={() => setDraft({ ...g, term: t.term })}>
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
            </View>
          );
        })}
      </StateView>
      {draft && <GradeSheet draft={draft} onClose={() => setDraft(null)} onSaved={() => {
        if (draft.id) setEditedIds([...editedIds, draft.id]);
        reload();
      }} />}
      <TranscriptSheets picking={picking} onClose={() => setPicking(false)} onSaved={reload} />
    </Screen>
  );
}

type Recalc = { recalculated: { remaining_total: number | null; new_eligible_scholarships: number } };

const TRANSCRIPT_WARNING = '성적증명서에는 이름·학번·생년월일 같은 개인정보가 들어 있어요.\n\n'
  + '· 본인 증명서만 올려 주세요.\n· 학교 서버가 글자만 읽고, 파일과 읽은 글자는 저장하지 않아요.\n'
  + '· 잘못 읽을 수 있어요. 특히 사진은 오류가 더 많으니 저장 전에 과목·학점·성적을 꼭 확인해 주세요.\n'
  + '· 잘못 저장하면 졸업 요건과 장학금 판정이 틀어질 수 있어요.';

/** uri의 파일 → base64 (expo-document-picker는 base64를 직접 주지 않음) */
async function fileBase64(uri: string) {
  const blob = await (await fetch(uri)).blob();
  return new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1]);
    r.onerror = () => fail(new Error('파일을 읽지 못했어요'));
    r.readAsDataURL(blob);
  });
}

/** 성적증명서 → 서버가 읽은 과목 미리보기 → 학생이 확인한 것만 저장 */
function TranscriptSheets({ picking, onClose, onSaved }: { picking: boolean; onClose: () => void; onSaved: () => void }) {
  const [items, setItems] = useState<TranscriptItem[] | null>(null);
  const [dropped, setDropped] = useState(0);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [terms, setTerms] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<number | null>(null); // 펼쳐서 고치는 과목
  const [check, setCheck] = useState<{ read: number; stated: number } | null>(null);
  const { busy, run } = useSubmit();
  const rows = (items ?? []).map((g, i) => ({ g, i, key: transcriptGroup(g, i) }));
  const candidates = rows.filter(r => !r.g.excluded);
  const excluded = rows.filter(r => r.g.excluded);
  const payloads = candidates.map(r => transcriptPayload(r.g, terms[r.key]));
  const invalid = payloads.some(g => g === null);
  const earned = candidates.reduce((n, r) => n + (r.g.grade === 'F' ? 0 : r.g.credits ?? 0), 0); // 고치거나 빼면 바로 다시 비교
  // 학기 순서로 묶어 보임 (같은 학기로 합친 묶음은 그대로 둠)
  const groups = [...new Set(candidates.map(r => r.key))].sort((a, b) => (terms[a] ?? '9').localeCompare(terms[b] ?? '9') || a.localeCompare(b));
  function update(index: number, change: Partial<TranscriptItem>) {
    setItems(current => current?.map((g, i) => i === index ? { ...g, ...change } : g) ?? null);
  }
  function drop(index: number) {
    setItems(current => current?.filter((_, i) => i !== index) ?? null);
    setTerms(t => Object.fromEntries(Object.entries(t).filter(([key]) => !key.startsWith('row-')))); // 'row-번호' 묶음은 번호가 밀림
    setEditing(null);
  }

  const read = (pick: () => Promise<string | null>) => run(async () => {
    try {
      const content = await pick();
      if (!content) return;
      const res = await api.post<{ items: TranscriptItem[]; dropped: number; unmatched_lines?: string[]; credit_check?: { read: number; stated: number } | null }>('/grades/from-file', { content_base64: content, preview_version: 2 });
      setItems(res.items);
      setDropped(res.dropped);
      setUnmatched(res.unmatched_lines ?? []);
      setCheck(res.credit_check ?? null);
      setTerms(Object.fromEntries(res.items.flatMap((g, i) => g.term ? [[transcriptGroup(g, i), g.term]] : [])));
      setEditing(null);
      onClose();
    } catch (e) {
      showAlert('성적을 읽지 못했어요', (e as ApiError).message);
    }
  });
  const fromPdf = () => read(async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    return res.canceled ? null : fileBase64(res.assets[0].uri);
  });
  const fromPhoto = () => read(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });
    return res.canceled ? null : res.assets[0]?.base64 ?? null;
  });

  const save = () => run(async () => {
    if (invalid || !payloads.length) return;
    let saved = 0;
    const failed: string[] = [];
    for (const item of payloads) {
      if (!item) continue;
      try {
        await api.post('/grades', item);
        saved += 1;
      } catch {
        failed.push(item.course_name); // 이미 있는 과목 등
      }
    }
    setItems(null);
    onSaved();
    showAlert('성적을 저장했어요', `${saved}과목을 넣었어요.${failed.length ? `\n이미 있거나 넣지 못한 과목 ${failed.length}개: ${failed.slice(0, 8).join(', ')}` : ''}`);
  });

  return (
    <>
      <Sheet visible={picking} onClose={onClose} title="성적증명서 올리기" sub="글자가 선명할수록 정확해요. PDF를 권장해요.">
        <Button label={busy ? '읽는 중… 과목 수에 따라 시간이 걸려요' : 'PDF 파일 고르기'} disabled={busy} onPress={fromPdf} />
        <Button kind="ghost" label="사진 고르기" disabled={busy} onPress={fromPhoto} />
      </Sheet>
      <Sheet visible={!!items} onClose={() => setItems(null)} title="읽은 성적 확인" sub="증명서와 다른 과목은 눌러서 고치거나 − 로 빼 주세요.">
        {check && (
          <View style={[st.tip, earned !== check.stated && { backgroundColor: color.redSoft }]}>
            <Text style={[st.tipText, { fontWeight: '800' }]}>{earned === check.stated ? `✓ ${candidates.length}과목 ${earned}학점: 증명서 취득학점과 같아요` : `⚠️ 지금 ${earned}학점 / 증명서 취득학점 ${check.stated}학점: 빠지거나 잘못 읽은 과목이 있어요`}</Text>
          </View>
        )}
        {dropped > 0 && <Text style={st.tipText}>⚠️ 과목명을 읽지 못한 항목 {dropped}개는 직접 추가해 주세요.</Text>}
        {!!unmatched.length && <View style={{ gap: 6 }}><Text style={st.tipText}>⚠️ 빠졌을 수 있는 줄 {unmatched.length}개: 저장 후 과목 추가에서 넣어 주세요.</Text>{unmatched.map((line, i) => <Sub key={i}>{line}</Sub>)}</View>}
        {groups.map((key) => {
          const list = candidates.filter(r => r.key === key);
          const { source_year: year, source_semester: semester } = list[0].g;
          return (
            <View key={key} style={st.previewTerm}>
              <Label>{year && semester ? `증명서 ${year}년 ${semester}학기` : '증명서 학기를 못 읽었어요'} · {list.length}과목</Label>
              <Select value={terms[key] ?? ''} highlight={!terms[key]} items={[...(terms[key] ? [] : ['']), ...TERMS]} label={v => v ? termLabel(v) : '저장할 학기를 골라 주세요'} onChange={v => setTerms(t => ({ ...t, [key]: v }))} title="저장할 학기" />
              {list.map(({ g, i }) => {
                const bad = !transcriptPayload(g, '1-1');
                return (
                  <View key={i} style={st.previewRow}>
                    <View style={st.previewLine}>
                      <Pressable accessibilityLabel={`${g.course_name} 고치기`} style={{ flex: 1 }} onPress={() => setEditing(editing === i ? null : i)}>
                        <Text style={st.previewName}>{g.course_name}</Text>
                        <Sub>{g.credits ?? '?'}학점 · {g.area || '구분 확인'}</Sub>
                      </Pressable>
                      <View style={[st.grade, { backgroundColor: g.grade ? gradeTone(g.grade).bg : color.redSoft }]}>
                        <Text style={[st.gradeText, { color: g.grade ? gradeTone(g.grade).fg : color.red }]}>{g.grade ?? '확인'}</Text>
                      </View>
                      <Pressable accessibilityLabel={`${g.course_name} 빼기`} hitSlop={6} onPress={() => drop(i)} style={st.minus}><View style={st.minusBar} /></Pressable>
                    </View>
                    {(bad || editing === i) && (
                      <View style={{ gap: 6 }}>
                        {!!g.issues?.length && <Text style={st.previewIssue}>{g.issues.join(' · ')}</Text>}
                        {!!g.source_line && <Sub>원문: {g.source_line}</Sub>}
                        <Input value={g.course_name} onChangeText={v => update(i, { course_name: v })} placeholder="과목명" />
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <View style={{ flex: 1 }}><Input value={g.credits === null ? '' : String(g.credits)} keyboardType="decimal-pad" placeholder="학점" onChangeText={v => update(i, { credits: v.trim() && Number.isFinite(Number(v)) ? Number(v) : null })} /></View>
                          <View style={{ flex: 1 }}><Select value={g.grade ?? ''} items={['', ...GRADES]} label={v => v || '성적'} onChange={v => update(i, { grade: v || null })} title="취득 성적" /></View>
                        </View>
                        <Select value={g.area} items={[...new Set(['', ...AREAS, ...(g.area ? [g.area] : [])])]} label={v => v || '이수구분'} onChange={v => update(i, { area: v })} title="이수구분" />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}
        {!!excluded.length && (
          <View style={{ gap: 4 }}>
            <Label>저장하지 않는 과목 {excluded.length}개</Label>
            {excluded.map(({ g, i }) => <Sub key={i}>· {g.course_name}: {g.raw_grade === 'N/A' ? '재수강 전 성적(N/A)' : g.exclusion_reason}</Sub>)}
          </View>
        )}
        {invalid && <Text style={st.previewIssue}>학기나 빈 칸을 채우거나 그 과목을 빼면 저장할 수 있어요.</Text>}
        <Button label={busy ? '저장하는 중…' : `${candidates.length}과목 저장하기`} disabled={busy || invalid || !candidates.length} onPress={save} />
      </Sheet>
    </>
  );
}

/** ▶ FE 23번에 해당하는 부분: L-10 성적 항목 추가/수정 창 → 저장 후 졸업 요건·장학 판정 재계산 결과 표시 */
function GradeSheet({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [term, setTerm] = useState(draft.term);
  const [name, setName] = useState(draft.course_name ?? '');
  const [credits, setCredits] = useState(draft.credits ?? 3);
  const [grade, setGrade] = useState(draft.grade ?? 'A+');
  const [area, setArea] = useState(draft.area ?? '전공 필수');
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
      <Select value={area} items={[...new Set([...AREAS, area])]} onChange={setArea} title="이수 영역" />
      <View style={st.tip}><PicText name="idea" size={18} style={st.tipText}>직접 수정/입력한 성적은 졸업 학점 계산에 반영돼요.</PicText></View>
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
  previewTerm: { borderWidth: 1, borderColor: color.field, borderRadius: 14, padding: 12, gap: 8 },
  previewRow: { borderTopWidth: 1, borderColor: color.line, paddingTop: 8, gap: 8 },
  previewLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewName: { fontSize: 14, fontWeight: '700', color: color.ink },
  previewIssue: { fontSize: 13, fontWeight: '700', color: color.red },
  tip: { backgroundColor: '#E6F4EC', borderRadius: 12, padding: 12, marginVertical: 4 },
  tipText: { fontSize: 13, color: color.title },
});
