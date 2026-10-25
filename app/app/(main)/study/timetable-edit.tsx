// ▶ FE 22번에 해당하는 부분: L-4~L-7 과목 편집, 추가 방식 팝업, 과목 검색 추가, 직접 입력, 시간 중복·학점 초과 경고
// 시안 03 수강 과목 편집 + 팝업 04(추가 방식) · 05/06(과목 검색) · 07(직접 입력) · 08(등록 불가)
// 추가·빼기는 먼저 이 화면 안에서만 바뀌고(목록·시간표 미리보기에 바로 보임), '변경사항 저장하기'를 눌러야 서버에 저장됨.
// 시간이 겹치거나 학점을 넘으면 추가하는 순간 시안 08 창으로 알려 줌 (저장할 때 서버가 한 번 더 확인)
import { Feather } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Confirm, Input, Label, Segmented, Select, Sheet } from '../../../components/form';
import { TimetableGrid } from '../../../components/TimetableGrid';
import { Button, Screen, showAlert, StateView, Sub } from '../../../components/ui';
import { api, ApiError, useApi } from '../../../lib/api';
import { periodsToTime, semesterLabel, timesText } from '../../../lib/format';
import { checkAdd, CREDIT_LIMIT } from '../../../lib/schedule';
import { color } from '../../../lib/theme';
import type { Course, TimetableEntry } from '../../../lib/types';
import { CLASS_DAYS } from '../../../lib/constants';

type Popup = null | 'choose' | 'search' | 'direct';
/** 아직 저장 안 한 새 과목은 id가 음수. POST /timetable에 보낼 내용도 같이 들고 있음 */
type Draft = TimetableEntry & { body?: object };

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

  /** 목록에 넣기 (아직 저장 전). 겹치거나 학점을 넘으면 시안 08 창 */
  function add(entry: Omit<Draft, 'id'>) {
    const problem = checkAdd(entries, entry);
    // 막히면 창을 닫은 뒤 보던 검색·입력 창으로 돌아감 (검색어는 남아 있음)
    setReturnTo(problem ? popup : null);
    setPopup(null);
    if (problem) return setBlocked(problem);
    setDraft([...entries, { ...entry, id: -Date.now() }]);
  }

  /** 누르는 즉시 목록·미리보기에서 빠짐 (저장 전이라 '되돌리기'로 되살릴 수 있음) */
  function remove(e: Draft) {
    setDraft(entries.filter((x) => x.id !== e.id));
  }

  /** 뺀 과목은 DELETE, 새 과목은 POST. 서버가 409(겹침·학점 초과)를 주면 시안 08 창 */
  async function save() {
    if (!dirty) return router.back();
    setSaving(true);
    try {
      for (const r of removed) await api.del(`/timetable/${r.id}`);
      for (const a of added) await api.post('/timetable', a.body);
      setDraft(null);
      await reload();
      showAlert('저장했어요', `시간표에 ${added.length ? `${added.length}과목 추가` : ''}${added.length && removed.length ? ', ' : ''}${removed.length ? `${removed.length}과목 삭제` : ''}를 반영했어요.`);
      router.back();
    } catch (e) {
      const err = e as ApiError;
      setDraft(null); // 서버 기준으로 다시 맞춤 (이미 저장된 것은 남음)
      await reload();
      // 겹침·학점 초과(409)만 시안 08 창, 네트워크 오류 같은 나머지는 일반 알림
      if (err.status === 409) setBlocked({ title: err.code === 'CREDIT_LIMIT' ? '학점 초과' : '수강 과목 등록 불가', lines: err.message.split('\n') });
      else showAlert('저장하지 못했어요', `${err.message}\n이미 반영된 변경은 남아 있어요.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <Stack.Screen options={{ title: '수강 과목 편집' }} />
      <Screen>
        <View style={st.summary}>
          <Sub>{semesterLabel()}</Sub>
          <Text style={st.summaryText}>현재 수강 등록: <Text style={{ color: color.primary }}>총 {entries.length}과목 ({credits}학점)</Text></Text>
          <Sub>한 학기 최대 {CREDIT_LIMIT}학점</Sub>
        </View>
        <Button label="+ 과목 추가하기" onPress={() => setPopup('choose')} />
        {dirty && (
          <View style={st.unsaved}>
            <Text style={st.unsavedText}>
              저장 안 한 변경: {added.length ? `추가 ${added.length}` : ''}{added.length && removed.length ? ' · ' : ''}{removed.length ? `삭제 ${removed.length}` : ''}
            </Text>
            <Pressable onPress={() => setDraft(null)} hitSlop={8}><Text style={st.undo}>되돌리기</Text></Pressable>
          </View>
        )}
        {/* 바뀐 내용이 시간표에 어떻게 보이는지 바로 확인 */}
        <Text style={st.listTitle}>시간표 미리보기</Text>
        <TimetableGrid entries={entries} />
        <Text style={st.listTitle}>수강 과목 목록</Text>
        <StateView loading={loading} error={error} empty={!entries.length} emptyText="아직 등록한 과목이 없어요" onRetry={reload}>
          {entries.map((e) => (
            <View key={e.id} style={[st.course, e.id < 0 && st.courseNew]}>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={st.row}>
                  {!!e.category && <Text style={st.badge}>{e.category}</Text>}
                  <Text style={st.name}>{e.course_name}</Text>
                  {e.id < 0 && <Text style={st.newBadge}>새로 추가</Text>}
                  <Text style={st.meta}>{e.credits}학점{e.code ? ` · ${e.code}` : ''}</Text>
                </View>
                <Text style={st.times}>{timesText(e.times)}</Text>
                {!!e.professor && <Sub>담당교수: {e.professor} 교수님</Sub>}
              </View>
              <Pressable accessibilityLabel={`${e.course_name} 빼기`} onPress={() => remove(e)} style={st.minus}>
                <Text style={{ color: '#fff', fontWeight: '900' }}>−</Text>
              </Pressable>
            </View>
          ))}
        </StateView>
        <Button label={saving ? '저장하는 중…' : dirty ? '수강 과목 변경사항 저장하기' : '변경 없이 돌아가기'} disabled={saving} onPress={save} />
      </Screen>

      {/* 04 과목 추가 방식 선택 */}
      <Sheet visible={popup === 'choose'} onClose={() => setPopup(null)} title="과목 추가 방식 선택" sub="원하시는 추가 방식을 선택해 주세요.">
        <Choice icon="🔍" title="과목 검색으로 추가" sub="과목명 또는 과목코드로 빠르게 검색" on onPress={() => setPopup('search')} />
        <Choice icon="✍️" title="직접 입력으로 추가" sub="과목명, 요일, 교시 등을 직접 입력" onPress={() => setPopup('direct')} />
      </Sheet>

      {/* 05·06 과목 검색 */}
      <Sheet visible={popup === 'search'} onClose={() => setPopup(null)} title="과목 검색으로 추가">
        <Search q={query} setQ={setQuery} added={entries} onAdd={(c) => add({
          course_id: c.id, course_name: c.name, code: c.code, credits: c.credits, category: c.category,
          professor: c.professor, room: c.room, times: c.times, body: { course_id: c.id },
        })} />
      </Sheet>

      {/* 07 직접 입력 */}
      <Sheet visible={popup === 'direct'} onClose={() => setPopup(null)} title="직접 입력으로 추가">
        <Direct onAdd={(b) => add({ course_id: null, code: null, ...b, body: b })} />
      </Sheet>

      {/* 08 등록 불가 */}
      <Confirm visible={!!blocked} tone="danger" title={blocked?.title ?? ''} okLabel="확인" onOk={() => {
        setBlocked(null);
        setPopup(returnTo);
      }}>
        <View style={st.warn}>
          <Text style={st.warnStrong}>⚠️ {blocked?.lines[0]}</Text>
          {blocked?.lines.slice(1).map((l) => <Text key={l} style={st.warnText}>{l}</Text>)}
        </View>
      </Confirm>
    </View>
  );
}

function Choice({ icon, title, sub, on, onPress }: { icon: string; title: string; sub: string; on?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[st.choice, on && st.choiceOn]}>
      <View style={st.choiceIcon}><Text style={{ fontSize: 20 }}>{icon}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={[st.choiceTitle, on && { color: color.primary }]}>{title}</Text>
        <Sub>{sub}</Sub>
      </View>
      <Feather name="chevron-right" size={20} color={color.ink} />
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
  return (
    <View style={{ gap: 10 }}>
      <View>
        <Input value={q} onChangeText={setQ} placeholder="과목명 또는 과목코드를 입력하세요" autoFocus
          style={q ? { borderColor: color.primary, backgroundColor: '#fff' } : undefined} />
        {!!q && <Pressable onPress={() => setQ('')} style={st.clear}><Feather name="x" size={16} color={color.inkSub} /></Pressable>}
      </View>
      {!q ? (
        <View style={{ alignItems: 'center', paddingVertical: 28, gap: 6 }}>
          <Text style={{ fontSize: 30 }}>📚</Text>
          <Text style={{ fontWeight: '700', color: color.ink }}>수강할 과목을 검색해 주세요</Text>
          <Sub>개설된 교과목 정보에서 바로 추가 가능합니다.</Sub>
        </View>
      ) : (
        <>
          <Text style={{ fontWeight: '700', color: color.ink }}>검색 결과 <Text style={{ color: color.primary }}>{data?.length ?? 0}건</Text></Text>
          {data?.map((c) => (
            <View key={c.id} style={st.result}>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={st.row}>
                  {!!c.category && <Text style={st.badge}>{c.category}</Text>}
                  <Text style={st.name}>{c.name}</Text>
                </View>
                <Text style={st.resultMeta}>{c.credits}학점{c.code ? ` · ${c.code}` : ''} · {timesText(c.times)}</Text>
                {!!c.professor && <Sub>담당교수: {c.professor} 교수님</Sub>}
              </View>
              {addedIds.has(c.id)
                ? <Text style={st.addedText}>담음</Text>
                : <Pressable style={st.addBtn} onPress={() => onAdd(c)}><Text style={st.addText}>+ 추가</Text></Pressable>}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

type DirectBody = Pick<TimetableEntry, 'course_name' | 'category' | 'room' | 'professor' | 'credits' | 'times'>;

function Direct({ onAdd }: { onAdd: (body: DirectBody) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'전공' | '교양'>('전공');
  const [day, setDay] = useState('금');
  const [periods, setPeriods] = useState<number[]>([]);
  const [room, setRoom] = useState('');
  const [prof, setProf] = useState('');
  const toggle = (p: number) => setPeriods((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]));
  const time = periods.length ? periodsToTime(periods) : null;

  return (
    <View style={{ gap: 6 }}>
      <Label required>과목명</Label>
      <Input value={name} onChangeText={setName} placeholder="예: 모바일 앱 프로그래밍" />
      <Label required>과목 구분</Label>
      <Segmented value={kind} items={['전공', '교양']} onChange={setKind} />
      <Label required>수업 시간 및 요일</Label>
      <Select value={day} items={CLASS_DAYS} label={(d) => `${d}요일`} onChange={setDay} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {PERIODS.map((p) => (
          <Pressable key={p} onPress={() => toggle(p)} style={[st.period, periods.includes(p) && st.periodOn]}>
            <Text style={{ fontWeight: '700', color: periods.includes(p) ? '#fff' : color.ink }}>{String(p).padStart(2, '0')}</Text>
          </Pressable>
        ))}
      </View>
      <Sub>{time ? `${[...periods].sort().map((p) => String(p).padStart(2, '0')).join(', ')} 교시 (${time.start}~${time.end})` : '교시를 골라 주세요 (연속으로)'}</Sub>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Label>강의실</Label><Input value={room} onChangeText={setRoom} placeholder="유담관 502호" /></View>
        <View style={{ flex: 1 }}><Label>교수명</Label><Input value={prof} onChangeText={setProf} placeholder="박서경" /></View>
      </View>
      <Button label="시간표에 추가하기" disabled={!name || !time}
        onPress={() => onAdd({
          course_name: name, category: kind, room: room || null, professor: prof || null,
          credits: Math.min(periods.length, 4), // shortcut: 시안에 학점 칸이 없어서 교시 수 = 학점으로 봄. 학점 칸이 생기면 바꾸기
          times: [{ day, ...time! }],
        })} />
    </View>
  );
}

const st = StyleSheet.create({
  summary: { backgroundColor: color.primarySoft, borderRadius: 14, padding: 14, gap: 2 },
  summaryText: { fontSize: 16, fontWeight: '800', color: color.ink },
  listTitle: { fontSize: 15, fontWeight: '800', color: color.ink, marginTop: 6 },
  course: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: color.surface, borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: 'transparent' },
  courseNew: { borderColor: color.primary, backgroundColor: color.primarySoft },
  newBadge: { fontSize: 11, fontWeight: '800', color: '#fff', backgroundColor: color.primary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  unsaved: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: color.warnSoft, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  unsavedText: { fontSize: 13, fontWeight: '700', color: color.warn },
  undo: { fontSize: 13, fontWeight: '800', color: color.primary },
  addedText: { fontSize: 13, fontWeight: '800', color: color.inkSub, paddingHorizontal: 12, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { fontSize: 11, fontWeight: '800', color: color.primary, backgroundColor: '#fff', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  name: { fontSize: 16, fontWeight: '800', color: color.ink },
  meta: { fontSize: 12, color: color.inkSub, marginLeft: 'auto' },
  times: { fontSize: 14, fontWeight: '700', color: color.ink },
  minus: { width: 24, height: 24, borderRadius: 12, backgroundColor: color.alert, alignItems: 'center', justifyContent: 'center' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 16, backgroundColor: color.surface, borderWidth: 1.5, borderColor: 'transparent' },
  choiceOn: { borderColor: color.primary, backgroundColor: color.primarySoft },
  choiceIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  choiceTitle: { fontSize: 16, fontWeight: '800', color: color.ink },
  clear: { position: 'absolute', right: 12, top: 13, backgroundColor: color.line, borderRadius: 10, padding: 2 },
  result: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: color.surface, borderRadius: 14, padding: 14 },
  resultMeta: { fontSize: 13, fontWeight: '700', color: color.primary },
  addBtn: { backgroundColor: color.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  addText: { color: '#fff', fontWeight: '800' },
  period: { width: 40, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: color.surface },
  periodOn: { backgroundColor: color.primary },
  warn: { alignSelf: 'stretch', backgroundColor: color.warmSoft, borderRadius: 12, padding: 14, alignItems: 'center', gap: 4 },
  warnStrong: { color: color.alert, fontWeight: '800', textAlign: 'center' },
  warnText: { color: color.ink, textAlign: 'center' },
});
