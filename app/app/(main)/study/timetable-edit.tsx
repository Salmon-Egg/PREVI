// ▶ FE 22번에 해당하는 부분: L-4~L-7 과목 편집, 추가 방식 창, 과목 검색 추가, 직접 입력, 시간 중복·학점 초과 경고 (새 시안)
// 위: 학기·현재 수강 등록(과목 수·학점) → 점선 '+ 과목 추가하기' → 수강 과목 목록(구분 배지, 교시, 담당교수, −) → 판 아래 '변경사항 저장하기'
// 추가·빼기는 먼저 이 화면 안에서만 바뀌고, '수강 과목 변경사항 저장하기'를 눌러야 서버에 저장됨.
// 시간이 겹치거나 학점을 넘으면 추가하는 순간 '수강 과목 등록 불가' 창으로 알려 줌 (저장할 때 서버가 한 번 더 확인)
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Confirm, Input, Label, Segmented, Select, Sheet } from '../../../components/form';
import { Text } from '../../../components/Text';
import { Button, PicText, Screen, showAlert, StateView, Sub } from '../../../components/ui';
import { api, ApiError, useApi } from '../../../lib/api';
import { CLASS_DAYS } from '../../../lib/constants';
import { periodsToTime, semesterLabel, timesText } from '../../../lib/format';
import { checkAdd, CREDIT_LIMIT } from '../../../lib/schedule';
import { color, gradient, gradientBg } from '../../../lib/theme';
import type { Course, TimetableEntry } from '../../../lib/types';

type Popup = null | 'choose' | 'search' | 'direct';
/** 아직 저장 안 한 새 과목은 id가 음수. POST /timetable에 보낼 내용도 같이 들고 있음 */
type Draft = TimetableEntry & { body?: object };

/** 과목 구분 배지 색: 전필 진한 초록, 전선 연한 초록, 교양·일선 등 주황 (시안) */
function categoryTone(c: string) {
  if (c === '전필') return { bg: color.primary, fg: '#fff' };
  if (c.startsWith('전')) return { bg: '#E1F3E8', fg: color.primary };
  return { bg: '#FDF0D3', fg: '#B7791F' };
}

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return null;
  const t = categoryTone(category);
  return <View style={[st.badge, { backgroundColor: t.bg }]}><Text style={[st.badgeText, { color: t.fg }]}>{category}</Text></View>;
}

export default function TimetableEdit() {
  const { data, error, loading, reload } = useApi<TimetableEntry[]>('/timetable');
  const [popup, setPopup] = useState<Popup>(null);
  const [blocked, setBlocked] = useState<{ title: string; lines: string[] } | null>(null);
  const [draft, setDraft] = useState<Draft[] | null>(null); // null이면 아직 안 고침 → 서버 목록 그대로
  const [saving, setSaving] = useState(false);
  const [returnTo, setReturnTo] = useState<Popup>(null);
  const [query, setQuery] = useState(''); // 검색 창을 닫았다 열어도 검색어 유지
  const saved = data ?? [];
  const entries: Draft[] = draft ?? saved;
  const credits = entries.reduce((n, e) => n + e.credits, 0);
  const added = entries.filter((e) => e.id < 0);
  const kept = new Set(entries.map((e) => e.id));
  const removed = saved.filter((s) => !kept.has(s.id));
  const dirty = added.length + removed.length > 0;

  /** 목록에 넣기 (아직 저장 전). 겹치거나 학점을 넘으면 등록 불가 창 */
  function add(entry: Omit<Draft, 'id'>) {
    const problem = checkAdd(entries, entry);
    // 막히면 창을 닫은 뒤 보던 검색·입력 창으로 돌아감 (검색어는 남아 있음)
    setReturnTo(problem ? popup : null);
    setPopup(null);
    if (problem) return setBlocked(problem);
    setDraft([...entries, { ...entry, id: -Date.now() }]);
  }

  /** 누르는 즉시 목록에서 빠짐 (저장 전이라 '되돌리기'로 되살릴 수 있음) */
  function remove(e: Draft) {
    setDraft(entries.filter((x) => x.id !== e.id));
  }

  /** 뺀 과목은 DELETE, 새 과목은 POST. 서버가 409(겹침·학점 초과)를 주면 등록 불가 창 */
  async function save() {
    if (!dirty) return router.back();
    setSaving(true);
    try {
      for (const r of removed) await api.del(`/timetable/${r.id}`);
      for (const a of added) await api.post('/timetable', a.body);
      setDraft(null);
      await reload();
      showAlert('저장했어요', `시간표에 ${[added.length && `${added.length}과목 추가`, removed.length && `${removed.length}과목 삭제`].filter(Boolean).join(', ')}를 반영했어요.`);
      router.back();
    } catch (e) {
      const err = e as ApiError;
      setDraft(null); // 서버 기준으로 다시 맞춤 (이미 저장된 것은 남음)
      await reload();
      // 겹침·학점 초과(409)만 등록 불가 창, 네트워크 오류 같은 나머지는 일반 알림
      if (err.status === 409) setBlocked({ title: err.code === 'CREDIT_LIMIT' ? '학점 초과' : '수강 과목 등록 불가', lines: err.message.split('\n') });
      else showAlert('저장하지 못했어요', `${err.message}\n이미 반영된 변경은 남아 있어요.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="수강 과목 편집"
      footer={<Button label={saving ? '저장하는 중…' : '수강 과목 변경사항 저장하기'} disabled={saving} onPress={save} />}>
      <View style={st.summary}>
        <Text style={st.semester}>{semesterLabel()}</Text>
        <Text style={st.summaryText}>현재 수강 등록: 총 {entries.length}과목 ({credits}학점)</Text>
      </View>
      <Pressable style={st.addBox} onPress={() => setPopup('choose')}>
        <Text style={st.addBoxText}>+ 과목 추가하기</Text>
      </Pressable>
      {dirty && (
        <View style={st.unsaved}>
          <Text style={st.unsavedText}>
            저장 안 한 변경: {[added.length && `추가 ${added.length}`, removed.length && `삭제 ${removed.length}`].filter(Boolean).join(' · ')} · 최대 {CREDIT_LIMIT}학점
          </Text>
          <Pressable onPress={() => setDraft(null)} hitSlop={8}><Text style={st.undo}>되돌리기</Text></Pressable>
        </View>
      )}
      <View style={st.rule} />
      <Text style={st.listTitle}>수강 과목 목록</Text>
      <StateView loading={loading} error={error} empty={!entries.length} emptyText="아직 등록한 과목이 없어요" onRetry={reload}>
        {entries.map((e) => (
          <View key={e.id} style={[st.course, e.id < 0 && st.courseNew]}>
            <View style={{ flex: 1, gap: 5 }}>
              <View style={st.row}>
                <CategoryBadge category={e.category} />
                <Text style={st.name} numberOfLines={1}>{e.course_name}</Text>
                <Text style={st.meta}>{e.credits}학점{e.code ? ` · ${e.code}` : ''}</Text>
              </View>
              <Text style={st.times}>{timesText(e.times)}{e.id < 0 ? '  · 새로 추가' : ''}</Text>
              {!!e.professor && <Text style={st.prof}>담당교수: {e.professor} 교수님</Text>}
            </View>
            <Pressable accessibilityLabel={`${e.course_name} 빼기`} hitSlop={6} onPress={() => remove(e)} style={st.minus}>
              <View style={st.minusBar} />
            </Pressable>
          </View>
        ))}
      </StateView>

      {/* 과목 추가 방식 선택 */}
      <Sheet visible={popup === 'choose'} onClose={() => setPopup(null)} title="과목 추가 방식 선택" sub="원하시는 추가 방식을 선택해 주세요.">
        <Choice icon="🔍" title="과목 검색으로 추가" sub="과목명으로 빠르게 검색" onPress={() => setPopup('search')} />
        <Choice icon="✍️" title="직접 입력으로 추가" sub="과목명, 요일, 교시 등을 직접 입력" onPress={() => setPopup('direct')} />
      </Sheet>

      {/* 과목 검색 */}
      <Sheet visible={popup === 'search'} onClose={() => setPopup(null)} title="과목 검색으로 추가">
        <Search q={query} setQ={setQuery} added={entries} onAdd={(c) => add({
          course_id: c.id, course_name: c.name, code: c.code, credits: c.credits, category: c.category,
          professor: c.professor, room: c.room, times: c.times, body: { course_id: c.id },
        })} />
      </Sheet>

      {/* 직접 입력 */}
      <Sheet visible={popup === 'direct'} onClose={() => setPopup(null)} title="직접 입력으로 추가">
        {/* 서버는 과목명·학점·시간만 받음(나머지 칸을 보내면 400). 구분·강의실·교수는 목록 표시용으로만 */}
        <Direct onAdd={(b) => add({ course_id: null, code: null, ...b, body: { course_name: b.course_name, credits: b.credits, times: b.times } })} />
      </Sheet>

      {/* 등록 불가 */}
      <Confirm visible={!!blocked} title={blocked?.title ?? ''} okLabel="확인" onOk={() => {
        setBlocked(null);
        setPopup(returnTo);
      }}>
        <View style={st.warn}>
          <View style={{ alignSelf: 'center' }}><PicText name="warn" style={st.warnStrong}>{blocked?.lines[0]}</PicText></View>
          {blocked?.lines.slice(1).map((l) => <Text key={l} style={st.warnText}>{l}</Text>)}
        </View>
      </Confirm>
    </Screen>
  );
}

function Choice({ icon, title, sub, onPress }: { icon: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.choice, pressed && { opacity: 0.7 }]}>
      <View style={st.choiceIcon}><Text style={{ fontSize: 20 }}>{icon}</Text></View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={st.choiceTitle}>{title}</Text>
        <Text style={st.choiceSub}>{sub}</Text>
      </View>
      <Feather name="chevron-right" size={20} color={color.title} />
    </Pressable>
  );
}

function Search({ q, setQ, onAdd, added }: { q: string; setQ: (q: string) => void; onAdd: (course: Course) => void; added: TimetableEntry[] }) {
  // 글자마다 서버를 부르지 않게 입력이 0.3초 멈추면 검색
  const [term, setTerm] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data } = useApi<Course[]>(term ? `/courses?q=${encodeURIComponent(term)}` : null);
  const addedIds = new Set(added.map((e) => e.course_id));
  const list = term ? data ?? [] : [];
  return (
    <View style={{ gap: 12 }}>
      <View>
        <Input value={q} onChangeText={setQ} placeholder="과목명을 입력하세요" autoFocus style={{ paddingRight: 44 }} />
        {q
          ? <Pressable accessibilityLabel="검색어 지우기" onPress={() => setQ('')} style={st.clear}><Feather name="x" size={14} color="#fff" /></Pressable>
          : <View style={st.searchIcon}><Feather name="search" size={20} color={color.title} /></View>}
      </View>
      {!q ? (
        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
          <Text style={{ fontWeight: '800', fontSize: 15, color: color.ink }}>수강할 과목을 검색해 주세요</Text>
          <Sub>개설된 교과목 정보에서 바로 추가 가능합니다.</Sub>
        </View>
      ) : (
        <>
          <Sub>검색 결과 {list.length}건</Sub>
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10 }} nestedScrollEnabled>
            {list.map((c) => (
              <View key={c.id} style={st.result}>
                <View style={st.row}>
                  <CategoryBadge category={c.category} />
                  <Text style={st.name}>{c.name}</Text>
                </View>
                <Text style={st.resultMeta}>{c.credits}학점{c.code ? ` · ${c.code}` : ''} · {timesText(c.times)}</Text>
                <View style={[st.row, { justifyContent: 'space-between' }]}>
                  {c.professor ? <Text style={st.prof}>담당교수: {c.professor} 교수님</Text> : <View />}
                  {addedIds.has(c.id)
                    ? <Text style={st.addedText}>담음</Text>
                    : <Pressable style={[st.addBtn, gradientBg(gradient.primary, color.primary)]} onPress={() => onAdd(c)}><Text style={st.addText}>+ 추가</Text></Pressable>}
                </View>
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const pad = (p: number) => String(p).padStart(2, '0');

type DirectBody = Pick<TimetableEntry, 'course_name' | 'category' | 'room' | 'professor' | 'credits' | 'times'>;

function Direct({ onAdd }: { onAdd: (body: DirectBody) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'전공' | '교양'>('전공');
  const [day, setDay] = useState('금');
  const [periods, setPeriods] = useState<number[]>([]);
  const [picking, setPicking] = useState(false);
  const [room, setRoom] = useState('');
  const [prof, setProf] = useState('');
  const toggle = (p: number) => setPeriods((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]));
  const time = periods.length ? periodsToTime(periods) : null;
  const sorted = [...periods].sort((a, b) => a - b);

  return (
    <View style={{ gap: 6 }}>
      <Label required>과목명</Label>
      <Input value={name} onChangeText={setName} placeholder="예: 모바일 앱 프로그래밍" />
      <Label required>과목 구분</Label>
      <Segmented value={kind} items={['전공', '교양']} onChange={setKind} />
      <Label required>수업 시간 및 요일</Label>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ width: 92 }}><Select value={day} items={CLASS_DAYS} label={(d) => `${d}요일`} onChange={setDay} title="요일" /></View>
        {/* 교시 칸: 누르면 아래에 교시 버튼이 펼쳐짐 */}
        <Pressable style={[st.timeBox, picking && { borderColor: color.primaryLight }]} onPress={() => setPicking(!picking)}>
          <Text style={[st.timeText, !time && { color: '#9AA6A0' }]} numberOfLines={1}>
            {time ? `${sorted.map(pad).join(', ')} 교시 (${time.start}~${time.end})` : '교시 선택'}
          </Text>
        </Pressable>
      </View>
      {picking && (
        <View style={st.periods}>
          {PERIODS.map((p) => {
            const on = periods.includes(p);
            return (
              <Pressable key={p} onPress={() => toggle(p)} style={[st.period, on && gradientBg(gradient.primary, color.primary)]}>
                <Text style={{ fontWeight: '800', color: on ? '#fff' : color.title }}>{pad(p)}</Text>
              </Pressable>
            );
          })}
          <Sub>연속된 교시를 골라 주세요. 01교시 = 09:00</Sub>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, gap: 6 }}><Label>강의실</Label><Input value={room} onChangeText={setRoom} placeholder="유담관 502호" /></View>
        <View style={{ flex: 1, gap: 6 }}><Label>교수명</Label><Input value={prof} onChangeText={setProf} placeholder="박서경 교수님" /></View>
      </View>
      <View style={{ height: 8 }} />
      <Button label="시간표에 추가하기" disabled={!name.trim() || !time}
        onPress={() => onAdd({
          course_name: name.trim(), category: kind, room: room.trim() || null, professor: prof.trim().replace(/\s*교수님$/, '') || null,
          credits: Math.min(periods.length, 4), // shortcut: 시안에 학점 칸이 없어서 교시 수 = 학점으로 봄. 학점 칸이 생기면 바꾸기
          times: [{ day, ...time! }],
        })} />
    </View>
  );
}

const st = StyleSheet.create({
  summary: { backgroundColor: '#E6F4EC', borderWidth: 1, borderColor: color.field, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, gap: 2 },
  semester: { fontSize: 12, fontWeight: '800', color: color.title },
  summaryText: { fontSize: 15, fontWeight: '700', color: color.ink },
  addBox: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#8FC7A6', borderRadius: 16, paddingVertical: 14, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.6)' },
  addBoxText: { color: color.title, fontWeight: '800', fontSize: 15 },
  rule: { height: 1, backgroundColor: color.field, marginTop: 2 },
  listTitle: { fontSize: 15, fontWeight: '800', color: color.ink },
  course: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: color.field },
  courseNew: { borderColor: color.primaryLight, backgroundColor: '#F4FBF6' },
  unsaved: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: color.warnSoft, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  unsavedText: { flex: 1, fontSize: 12, fontWeight: '700', color: color.warn },
  undo: { fontSize: 13, fontWeight: '800', color: color.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '800', color: color.ink },
  meta: { fontSize: 12, color: color.inkSub, marginLeft: 'auto' },
  times: { fontSize: 13, color: color.ink },
  prof: { fontSize: 12, color: color.inkSub },
  minus: { width: 26, height: 26, borderRadius: 13, backgroundColor: color.redSoft, alignItems: 'center', justifyContent: 'center' },
  minusBar: { width: 11, height: 2, borderRadius: 1, backgroundColor: color.red },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 16, backgroundColor: '#EEF8F2', borderWidth: 1, borderColor: color.field },
  choiceIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#DCEFE3', alignItems: 'center', justifyContent: 'center' },
  choiceTitle: { fontSize: 16, fontWeight: '800', color: color.ink },
  choiceSub: { fontSize: 12, color: color.inkSub },
  clear: { position: 'absolute', right: 12, top: 14, width: 22, height: 22, borderRadius: 11, backgroundColor: '#9AA6A0', alignItems: 'center', justifyContent: 'center' },
  searchIcon: { position: 'absolute', right: 14, top: 13 },
  result: { backgroundColor: '#F4FAF6', borderWidth: 1, borderColor: color.field, borderRadius: 18, padding: 14, gap: 6 },
  resultMeta: { fontSize: 13, color: color.inkSub },
  addedText: { fontSize: 13, fontWeight: '800', color: color.inkSub, paddingHorizontal: 12, paddingVertical: 8 },
  addBtn: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9 },
  addText: { color: '#fff', fontWeight: '800' },
  timeBox: { flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: color.field, justifyContent: 'center', paddingHorizontal: 14 },
  timeText: { fontSize: 14, color: color.ink, fontWeight: '600' },
  periods: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, backgroundColor: '#F4FAF6', borderRadius: 12, padding: 10 },
  period: { width: 42, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: color.field },
  warn: { alignSelf: 'stretch', backgroundColor: '#FFF4E6', borderWidth: 1, borderColor: '#F3C98B', borderRadius: 14, padding: 14, alignItems: 'center', gap: 4 },
  warnStrong: { color: '#B4630B', fontWeight: '800', textAlign: 'center' },
  warnText: { color: color.ink, textAlign: 'center', fontSize: 13, lineHeight: 19 },
});
