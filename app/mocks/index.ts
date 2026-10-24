// ▶ FE 3번에 해당하는 부분: 예시 데이터 (USE_MOCK=1이면 서버 대신 이 값을 돌려줌)
// 서버 없이 화면을 만들 때 쓰는 예시 데이터 (EXPO_PUBLIC_USE_MOCK=1).
// 모양은 docs/04_API_명세.md 예시와 같음. 고친 내용은 앱을 다시 켜면 처음으로 돌아감.
// 시연용 가상 학생 4명 중 누구로 로그인했는지에 따라 이름·학과·학년이 바뀜 (나머지 예시는 같음)
import { PERSONAS } from '../lib/config';
import { getToken } from '../lib/session';
import type {
  Application, CalendarEvent, ChatCard, ChatReply, ClaimQuestion, Conversation, GradeTerm, Home, LostItem, Me, Message,
  NoticeDetail, Notification, Scholarship, TimetableEntry, TodoDetail,
} from '../lib/types';

const d = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const dday = (date: string) => Math.round((new Date(date + 'T00:00:00').getTime() - new Date(d(0) + 'T00:00:00').getTime()) / 864e5);
const now = () => new Date().toISOString();

const me: Me = {
  nickname: '홍길동', department: '소프트웨어학과', minor: null, grade: 4, semester: 2, status: 'enrolled',
  admission_year: 2021, interests: ['장학금'], completed_requirements: ['졸업 영어 인증'],
  consent: { agreed: true, agreed_at: '2026-10-20T10:00:00+09:00' },
  notify: { notice: true, deadline: true, calendar: true, chat: true, time: '09:00' },
  assistant_scope: { grades: true, timetable: true, status: true, chat_history: true },
};

/** 로그인한 가상 학생에 맞춰 이름·학과·학년을 바꿈 (dev-<id> 토큰) */
function applyPersona() {
  const p = PERSONAS.find((x) => getToken() === `dev-${x.id}`);
  if (!p || me.nickname === p.name) return;
  const [grade, dept] = p.desc.split(' · ');
  Object.assign(me, { nickname: p.name, department: dept, grade: Number(grade[0]), admission_year: 2026 - Number(grade[0]) + 1 });
}

const todos: TodoDetail[] = [
  { id: 31, type: 'graduation', title: '졸업작품 심사 신청', due_date: d(0), d_day: 0, done: false,
    reason: "4학년 2학기 졸업 예정자는 '졸업작품 심사 신청'을 마쳐야 해요. 아직 완료 기록이 없어요.", link: 'https://www.skuniv.ac.kr',
    source: { kind: 'notice', id: 103 }, done_at: null },
  { id: 32, type: 'scholarship', title: '서경 AI 마일리지 장학금 신청', due_date: d(12), d_day: 12, done: false,
    reason: '신청 조건을 모두 충족해요. 4학년 (대상 2·3·4학년) ✓ · 직전 학기 평점 4.0 (기준 3.0 이상) ✓', link: null,
    source: { kind: 'notice', id: 104 }, done_at: null },
  { id: 33, type: 'deadline', title: '동계 계절학기 수강신청', due_date: d(14), d_day: 14, done: false,
    reason: '학적·학년이 공지 대상에 해당해요.', link: null, source: { kind: 'notice', id: 106 }, done_at: null },
  { id: 34, type: 'deadline', title: '캡스톤 영수증 제출', due_date: d(6), d_day: 6, done: false,
    reason: '채팅에서 알림을 받기로 한 일이에요.', link: null, source: null, done_at: null },
  { id: 35, type: 'graduation', title: '졸업 논문(보고서) 최종본 제출', due_date: d(20), d_day: 20, done: false,
    reason: '졸업 요건 중 남은 항목이에요. 졸업작품 심사를 신청한 뒤 최종본을 내야 해요.', link: null, source: { kind: 'notice', id: 103 }, done_at: null },
  { id: 36, type: 'scholarship', title: '국가장학금 2차 신청 (소득분위 확인)', due_date: d(0), d_day: 0, done: false,
    reason: '소득분위는 앱이 알 수 없어서 직접 확인이 필요해요. 오늘 23:59 마감이에요.', link: 'https://www.kosaf.go.kr',
    source: { kind: 'notice', id: 102 }, done_at: null },
  { id: 37, type: 'status', title: '2027-1학기 복학 신청 기간 확인', due_date: d(9), d_day: 9, done: false,
    reason: '학사일정에 복학 신청 기간이 있어요. 휴학 중이면 기간 안에 신청해야 해요.', link: null, source: { kind: 'calendar', id: 4 }, done_at: null },
  { id: 38, type: 'deadline', title: '중간 강의평가 참여', due_date: d(-2), d_day: -2, done: true,
    reason: '강의평가에 참여하면 성적 조회가 빨라져요.', link: null, source: { kind: 'notice', id: 107 }, done_at: `${d(-3)}T14:20:00+09:00` },
];

const scholarships: Scholarship[] = [
  { notice_id: 101, title: '2026-2학기 성적우수 장학금 (A종)', deadline: `${d(-30)}T18:00:00+09:00`, verdict: 'eligible',
    reasons: ['직전 학기 평점 4.0 (기준 3.5 이상) ✓'], applied: true, applied_at: '2026-09-15T10:00:00+09:00' },
  { notice_id: 102, title: '2026-2학기 국가장학금 2차 신청 안내', deadline: `${d(0)}T23:59:00+09:00`, verdict: 'check',
    reasons: ['소득분위 8구간 이하 — 앱이 알 수 없어 직접 확인이 필요해요'], applied: false, applied_at: null },
  { notice_id: 104, title: '서경 AI 마일리지 장학금 신청 안내', deadline: `${d(12)}T18:00:00+09:00`, verdict: 'eligible',
    reasons: ['4학년 (대상 2·3·4학년) ✓', '직전 학기 평점 4.0 (기준 3.0 이상) ✓'], applied: false, applied_at: null },
  { notice_id: 105, title: '2026-2학기 새내기 정착 장학금 안내', deadline: `${d(8)}T18:00:00+09:00`, verdict: 'ineligible',
    reasons: ['1학년 대상 — 지금 4학년 ✗'], applied: false, applied_at: null },
];

type NoticeSeed = Omit<NoticeDetail, 'eligibility' | 'todo_id' | 'applied'>;
const NOTICE_BODY = `1. 신청 대상
- 재학생, 복학생, 신입생, 편입생 등
- 직전학기 12학점 이상 이수 및 B학점 이상

2. 신청 기간 및 방법
- 기간 : 공지의 마감일까지
- 방법 : 한국장학재단 홈페이지 및 서경대 종합정보시스템

3. 제출 서류
- 가구원 정보제공 동의서 및 가족관계증명서`;

const notices: NoticeSeed[] = [
  ...scholarships.map((s): NoticeSeed => ({
    id: s.notice_id, title: s.title, category: '장학', deadline: s.deadline, posted_at: `${d(-14)}T09:00:00+09:00`,
    summary: [s.reasons[0], `마감: ${s.deadline?.slice(5, 10).replace('-', '/')}`, '서류: 신청서, 성적증명서'],
    body: NOTICE_BODY, documents: ['신청서', '성적증명서'], url: 'https://www.skuniv.ac.kr',
  })),
  { id: 103, title: '2026-2학기 졸업작품 심사 신청 안내', category: '학사', deadline: `${d(0)}T17:00:00+09:00`, posted_at: `${d(-10)}T10:00:00+09:00`,
    summary: ['졸업 예정자(4학년 2학기) 대상', '마감: 오늘 17:00', '학과 사무실에 심사 신청서 제출'],
    body: '1. 대상: 2027년 2월 졸업 예정자\n2. 제출: 졸업작품 심사 신청서, 지도교수 확인서\n3. 장소: 각 학과 사무실', documents: ['심사 신청서', '지도교수 확인서'], url: null },
  { id: 106, title: '2026학년도 동계 계절학기 수강신청 안내', category: '수업', deadline: `${d(14)}T18:00:00+09:00`, posted_at: `${d(-3)}T09:00:00+09:00`,
    summary: ['재학생·휴학생 모두 신청 가능', '최대 6학점까지', '수강료는 학점당 납부'],
    body: '1. 신청 기간: 공지 마감일까지\n2. 최대 6학점\n3. 폐강 기준: 수강 인원 10명 미만', documents: [], url: null },
  { id: 107, title: '2026-2학기 중간 강의평가 실시', category: '수업', deadline: `${d(-1)}T23:59:00+09:00`, posted_at: `${d(-9)}T09:00:00+09:00`,
    summary: ['종합정보시스템에서 참여', '참여하면 성적 조회 우선'], body: '중간 강의평가에 참여해 주세요.', documents: [], url: null },
  { id: 108, title: '2027-1학기 휴·복학 신청 안내', category: '학사', deadline: `${d(30)}T18:00:00+09:00`, posted_at: `${d(-1)}T09:00:00+09:00`,
    summary: ['휴학은 한 번에 최대 2학기', '복학 신청은 개강 전 기간 안에', '군 휴학은 입영통지서 필요'],
    body: '1. 일반휴학: 1회 최대 2학기, 통산 6학기\n2. 복학: 학사일정의 복학 신청 기간에 종합정보시스템에서 신청\n3. 휴학 중에는 재학생 대상 교내 장학 신청 불가', documents: ['휴학원'], url: null },
  { id: 109, title: '서경 취업박람회 2026 참가 안내', category: '행사', deadline: null, posted_at: `${d(-2)}T09:00:00+09:00`,
    summary: ['3·4학년 추천', '청운관 1층 로비', '이력서 컨설팅 부스 운영'], body: '취업박람회에 참가해 보세요.', documents: [], url: null },
];

const calendar = (): CalendarEvent[] => [
  { id: 1, title: '중간 강의평가', start_date: d(-8), end_date: d(-1), description: '종합정보시스템' },
  { id: 2, title: '중간고사 성적 확인', start_date: d(4), end_date: d(6), description: null },
  { id: 3, title: '동계 계절학기 수강신청', start_date: d(10), end_date: d(14), description: '최대 6학점' },
  { id: 4, title: '2027-1학기 복학 신청 기간', start_date: d(9), end_date: d(16), description: '휴학생 대상' },
  { id: 5, title: '2027-1학기 휴학 신청 기간', start_date: d(9), end_date: d(30), description: null },
  { id: 6, title: '기말고사', start_date: d(40), end_date: d(46), description: null },
  { id: 7, title: '서경 취업박람회', start_date: d(2), end_date: d(2), description: '청운관 로비' },
].map((e) => ({ ...e, d_day: dday(e.start_date) }));

const graduation = () => ({
  required_total: 130, earned_total: 121, remaining_total: 9,
  areas: [
    { name: '전공 필수', required: 39, earned: 36 }, { name: '전공 선택', required: 45, earned: 45 },
    { name: '교양 필수', required: 18, earned: 18 }, { name: '교양 선택', required: 28, earned: 22 },
  ],
  requirements: [
    { name: '졸업 영어 인증', done: true },
    { name: '졸업작품 심사 신청', done: todos.find((t) => t.id === 31)!.done, todo_id: 31 },
    { name: '졸업 논문(보고서) 최종본 제출', done: todos.find((t) => t.id === 35)!.done, todo_id: 35 },
  ],
});

const grades: GradeTerm[] = [
  { term: '3-2', gpa: 3.83, items: [
    { id: 4, term: '3-2', course_name: '데이터베이스', credits: 3, grade: 'A0', area: '전공' },
    { id: 5, term: '3-2', course_name: '운영체제', credits: 3, grade: 'B+', area: '전공' },
    { id: 6, term: '3-2', course_name: '글쓰기와 소통', credits: 2, grade: 'A+', area: '교양 필수' },
  ] },
  { term: '4-1', gpa: 4.0, items: [
    { id: 7, term: '4-1', course_name: '캡스톤디자인I', credits: 3, grade: 'A+', area: '전공' },
    { id: 8, term: '4-1', course_name: '소프트웨어공학', credits: 3, grade: 'A0', area: '전공' },
    { id: 9, term: '4-1', course_name: '인공지능개론', credits: 3, grade: 'B+', area: '전공' },
  ] },
];

const timetable: TimetableEntry[] = [
  { id: 1, course_id: 1, course_name: '캡스톤디자인II', code: 'CS0401', credits: 3, category: '전필', professor: '김서경', room: '북304',
    times: [{ day: '월', start: '10:00', end: '12:00' }, { day: '수', start: '09:00', end: '10:00' }] },
  { id: 2, course_id: 4, course_name: '금융빅데이터응용', code: 'CS0388', credits: 3, category: '전선', professor: '이금융', room: '정보202',
    times: [{ day: '화', start: '10:00', end: '12:00' }] },
  { id: 3, course_id: 3, course_name: '빅데이터분석', code: 'CS0355', credits: 3, category: '전선', professor: '박데이터', room: '정보301',
    times: [{ day: '수', start: '13:00', end: '16:00' }] },
  { id: 4, course_id: 16, course_name: '서경인성리더십', code: 'GE0101', credits: 1, category: '교양', professor: '서경인', room: '청운홀',
    times: [{ day: '금', start: '12:00', end: '13:00' }] },
];

const notifications: Notification[] = [
  { id: 501, type: 'deadline', title: '졸업작품 심사 신청 마감이 오늘이에요', target_id: 31, read: false, sent_at: `${d(0)}T09:00:00+09:00` },
  { id: 503, type: 'calendar', title: '3일 뒤 중간고사 성적 확인이 시작돼요', target_id: 2, read: false, sent_at: `${d(0)}T09:00:00+09:00` },
  { id: 502, type: 'notice', title: '서경 AI 마일리지 장학금 신청 안내 공지가 올라왔어요', target_id: 104, read: true, sent_at: `${d(-1)}T09:05:00+09:00` },
  { id: 504, type: 'chat', title: '"휴학하면 장학금은 어떻게 돼?" 답변이 도착했어요', target_id: 2, read: true, sent_at: `${d(-2)}T15:30:00+09:00` },
];

/** 졸업 관련 할 일은 4학년에게만 (가상 학생마다 다르게 보이게) */
const mine = (t: TodoDetail) => t.type !== 'graduation' || me.grade === 4;

const home = (): Home => {
  applyPersona();
  const open = todos.filter((t) => mine(t) && !t.done && (t.d_day ?? 0) >= 0).sort((a, b) => (a.d_day ?? 99) - (b.d_day ?? 99));
  const todayCount = open.filter((t) => t.d_day === 0).length;
  const eligible = scholarships.filter((s) => !s.applied && s.verdict === 'eligible').length;
  const next = calendar().filter((e) => e.d_day >= 0).sort((a, b) => a.d_day - b.d_day)[0];
  const newNotices = notices.filter((n) => n.posted_at && dday(n.posted_at.slice(0, 10)) >= -3).length;
  return {
    nickname: me.nickname,
    unread_notifications: notifications.filter((n) => !n.read).length,
    briefing: `오늘 마감 ${todayCount}개, 신청 가능한 장학금 ${eligible}개가 있어요`,
    today_todos: open.slice(0, 9),
    next_event: next ? { id: next.id, title: next.title, start_date: next.start_date, d_day: next.d_day } : null,
    menu_status: {
      study: `졸업까지 ${graduation().remaining_total}학점`,
      scholarship: `신청 가능 ${eligible}건${scholarships.some((s) => !s.applied && s.verdict !== 'ineligible' && s.deadline?.startsWith(d(0))) ? ' · 오늘 마감' : ''}`,
      admin: `새 공지 ${newNotices}건`,
      campus: '비슷한 습득물 1건',
    },
    suggested_questions: me.grade === 4
      ? ['졸업까지 뭐가 남았어?', '졸업작품 심사 신청은 언제까지야?', '장학금 신청 마감 언제야?']
      : ['수강신청 일정 알려줘', '내가 받을 수 있는 장학금 있어?', '도서관 이용시간이 어떻게 돼?'],
  };
};

// ---- 채팅: 질문 낱말에 따라 미리 정한 답 (실제로는 서버 챗봇 ⑩~⑭) ----
type Reply = Pick<Message, 'text' | 'cards' | 'sources' | 'actions'>;
const HAKSA = { title: '2026 서경대학교 학사요람', url: null };

function answer(q: string, ctx: { kind: string; id: number } | null): Reply {
  if (ctx?.kind === 'todo') {
    const t = todos.find((x) => x.id === ctx.id);
    if (t) return {
      text: `'${t.title}'은(는) ${t.due_date ?? '마감 없음'}까지예요. ${t.reason ?? ''} 아래 버튼으로 바로 처리할 수 있어요.`,
      cards: [], sources: [HAKSA],
      actions: [
        ...(t.link ? [{ type: 'open_link' as const, label: '신청 페이지', payload: { url: t.link } }] : []),
        { type: 'open_screen', label: '할 일 자세히', payload: { screen: 'T-2', id: t.id } },
      ],
    };
  }
  if (/휴학|복학/.test(q)) return {
    text: '학칙에 따르면 일반휴학은 한 번에 최대 2학기, 통산 6학기까지 할 수 있어요. 휴학 중에는 재학생 대상 교내 장학금을 신청할 수 없고, 복학한 학기부터 다시 판정해요. 복학 신청은 학사일정의 복학 신청 기간에 해야 해요.',
    cards: [{ image_url: null, title: '2027-1학기 복학 신청 기간', lines: [calendar()[3].start_date, `${calendar()[3].end_date}까지`], link: null }],
    sources: [HAKSA, { title: '2027-1학기 휴·복학 신청 안내', url: null }],
    actions: [
      { type: 'add_todo', label: '복학 신청 마감 알림 받기', payload: { title: '2027-1학기 복학 신청', due_date: calendar()[3].end_date } },
      { type: 'open_screen', label: '휴·복학 안내', payload: { screen: 'A-3' } },
    ],
  };
  if (/장학/.test(q)) {
    const ok = scholarships.filter((s) => !s.applied && s.verdict !== 'ineligible');
    return {
      text: `지금 신청할 수 있는 장학금은 ${ok.length}개예요. '${ok[0].title.replace(/ 안내$/, '')}'은(는) 오늘 마감이니 먼저 확인해 보세요.`,
      cards: ok.map((s): ChatCard => ({ image_url: null, title: s.title.replace(/ 안내$/, ''), lines: [s.verdict === 'eligible' ? '신청 가능' : '확인 필요', s.reasons[0]], link: null })),
      sources: ok.map((s) => ({ title: s.title, url: null })),
      actions: [
        { type: 'open_screen', label: '장학금 전체 보기', payload: { screen: 'S-1' } },
        { type: 'add_todo', label: '마감 알림 받기', payload: { title: ok[0].title.replace(/ 안내$/, ''), due_date: ok[0].deadline?.slice(0, 10) ?? null } },
      ],
    };
  }
  if (/졸업|학점/.test(q)) {
    const g = graduation();
    return {
      text: `${me.nickname}님, 졸업 요건을 확인해 드릴게요! 현재 ${g.earned_total}학점을 이수했고, 졸업까지 ${g.remaining_total}학점이 남았어요. 졸업작품 심사 신청이 오늘 마감이에요.`,
      cards: [{ image_url: null, title: '졸업 요건 이수 현황', lines: [`${g.remaining_total}학점 남음`, `${g.earned_total} / ${g.required_total}학점`,
        ...g.areas.map((a) => `${a.earned >= a.required ? '✓' : '○'} ${a.name} ${a.earned} / ${a.required}`)], link: null }],
      sources: [HAKSA],
      actions: [
        { type: 'open_screen', label: '졸업작품 심사 신청하기', payload: { screen: 'T-2', id: 31 } },
        { type: 'open_screen', label: '졸업 요건 자세히', payload: { screen: 'L-2' } },
        { type: 'add_todo', label: '마감 알림 받기', payload: { title: '졸업작품 심사 신청', due_date: d(0) } },
      ],
    };
  }
  if (/일정|수강/.test(q)) {
    const list = calendar().filter((e) => e.d_day >= 0 && e.d_day <= 14);
    return {
      text: `앞으로 2주 안의 학사 일정은 ${list.length}개예요. ${list[0]?.title ?? ''}이(가) 가장 가까워요.`,
      cards: list.slice(0, 3).map((e): ChatCard => ({ image_url: null, title: e.title, lines: [e.d_day === 0 ? '오늘' : `D-${e.d_day}`, `${e.start_date}${e.end_date && e.end_date !== e.start_date ? ` ~ ${e.end_date}` : ''}`], link: null })),
      sources: [{ title: '2026학년도 학사일정', url: null }],
      actions: [{ type: 'open_screen', label: '학사 일정 보기', payload: { screen: 'A-2' } }],
    };
  }
  if (/챙길|오늘/.test(q)) {
    const h = home();
    return {
      text: `${h.briefing}. 가장 급한 일부터 정리했어요.`,
      cards: h.today_todos.slice(0, 3).map((t): ChatCard => ({ image_url: null, title: t.title, lines: [t.d_day === 0 ? '오늘 마감' : `D-${t.d_day}`, t.due_date ?? ''], link: null })),
      sources: [], actions: [{ type: 'open_screen', label: '할 일 전체 보기', payload: { screen: 'T-1' } }],
    };
  }
  if (/지갑|분실|잃어/.test(q)) return {
    text: '교내 분실물 중 비슷한 물건을 찾아봤어요. 아래 습득물이 가장 비슷해요.',
    cards: [{ image_url: null, title: '검정 가죽 반지갑', lines: ['일치도 92%', '중앙도서관 1층 로비 · 학생지원팀 보관'], link: null }],
    sources: [], actions: [{ type: 'open_screen', label: '분실물 센터', payload: { screen: 'C-1' } }],
  };
  return {
    text: '학교 문서에서 근거를 찾지 못했어요. 질문을 조금 더 구체적으로 적어 주시거나, 학생지원팀(02-940-7000)에 문의해 주세요.',
    cards: [], sources: [], actions: [],
  };
}

const conversations: (Conversation & { messages: Message[] })[] = [
  { id: 1, title: '국가장학금 2차 신청 서류', pinned: true, updated_at: `${d(-1)}T10:00:00+09:00`, preview: '국가장학금 2차 신청에 필요한 서류를 알려줘', messages: [] },
  { id: 2, title: '휴학하면 장학금은 어떻게 돼?', pinned: false, updated_at: `${d(-2)}T15:30:00+09:00`, preview: '휴학 중에는 재학생 대상 교내 장학금을…', messages: [] },
  { id: 3, title: '졸업까지 뭐가 남았어?', pinned: false, updated_at: `${d(-4)}T11:00:00+09:00`, preview: '졸업까지 9학점이 남았어요', messages: [] },
  { id: 4, title: '도서관 이용시간', pinned: false, updated_at: `${d(-6)}T18:20:00+09:00`, preview: '중앙도서관 이용시간이 어떻게 돼?', messages: [] },
  { id: 5, title: '검정 지갑을 잃어버렸어', pinned: false, updated_at: `${d(-9)}T09:40:00+09:00`, preview: '비슷한 습득물 1건을 찾았어요', messages: [] },
];
// 미리 만든 대화에 질문·답 한 쌍씩 채워 둠
for (const c of conversations) {
  const a = answer(c.title, null);
  c.messages = [
    { id: c.id * 100, role: 'user', text: c.title, cards: [], sources: [], actions: [], created_at: c.updated_at },
    { id: c.id * 100 + 1, role: 'assistant', created_at: c.updated_at, ...a },
  ];
}

function chat(body: { conversation_id: number | null; text: string; context: { kind: string; id: number } | null }): ChatReply {
  let c = conversations.find((x) => x.id === body.conversation_id);
  if (!c) {
    c = { id: Date.now(), title: body.text.slice(0, 30), pinned: false, updated_at: now(), preview: body.text, messages: [] };
    conversations.unshift(c);
  }
  const message: Message = { id: Date.now(), role: 'assistant', created_at: now(), ...answer(body.text, body.context) };
  c.messages.push({ id: Date.now() - 1, role: 'user', text: body.text, cards: [], sources: [], actions: [], created_at: now() }, message);
  c.updated_at = now();
  return { conversation_id: c.id, message };
}

// ---- 분실물 (FE 35번) ----
const lostItems: LostItem[] = [
  { id: 901, kind: 'found', title: '검정 가죽 반지갑', category: '지갑', place: '중앙도서관 1층 로비', found_at: `${d(-1)}T15:30:00+09:00`,
    keep_at: '학생지원팀 (학생회관 1층)', description: '검정 가죽, 카드 3장 들어 있음', image_url: null, mine: false, status: 'matched',
    match: { item_id: 951, score: 92, reasons: ['종류가 같아요 (지갑)', '색이 같아요 (검정)', '잃어버린 곳과 가까워요 (중앙도서관)', '잃어버린 다음 날 발견됐어요'] } },
  { id: 902, kind: 'found', title: '흰색 무선 이어폰 케이스', category: '전자기기', place: '인문관 2층 복도', found_at: `${d(-2)}T12:10:00+09:00`,
    keep_at: '학생지원팀 (학생회관 1층)', description: '흰색, 에어팟 추정', image_url: null, mine: false, status: 'open', match: null },
  { id: 903, kind: 'found', title: '검정 카드지갑', category: '카드', place: '중앙도서관 3층', found_at: `${d(-5)}T10:00:00+09:00`,
    keep_at: '중앙도서관 안내데스크', description: '검정, 학생증 없음', image_url: null, mine: false, status: 'open',
    match: { item_id: 951, score: 61, reasons: ['색이 같아요 (검정)', '장소가 가까워요'] } },
  { id: 904, kind: 'found', title: '남색 우산', category: '기타', place: '청운관 1층', found_at: `${d(-8)}T18:00:00+09:00`,
    keep_at: '학생지원팀 (학생회관 1층)', description: '장우산', image_url: null, mine: false, status: 'returned', match: null },
  { id: 951, kind: 'lost', title: '검정 가죽 반지갑', category: '지갑', place: '중앙도서관 (추정)', found_at: `${d(-2)}T14:00:00+09:00`,
    keep_at: null, description: '안에 체크카드와 학생증', image_url: null, mine: true, status: 'matched', match: null },
];
const claimQuestions: ClaimQuestion[] = [
  { id: 1, question: '지갑 안에 든 카드는 몇 장인가요?' },
  { id: 2, question: '지갑의 브랜드나 눈에 띄는 특징을 적어 주세요.' },
];

export async function mockFetch(method: string, path: string, body?: any): Promise<unknown> {
  await new Promise((r) => setTimeout(r, method === 'POST' && path === '/chat' ? 900 : 200)); // 로딩·'답변 작성 중' 확인용
  applyPersona();
  const [p, qs] = path.split('?');
  const q = new URLSearchParams(qs);
  const id = Number(p.split('/')[2]);
  const key = `${method} ${p.replace(/\/\d+/, '/:id')}`;
  switch (key) {
    case 'GET /me': return me;
    case 'PUT /me': return Object.assign(me, body, body.notify && { notify: { ...me.notify, ...body.notify } }); // 서버처럼 notify는 합치기
    case 'DELETE /me': return undefined;
    case 'GET /home': return home();
    case 'GET /todos':
      return todos.filter((t) => mine(t) && (!q.has('done') || String(t.done) === q.get('done')) && (!q.get('type') || t.type === q.get('type')))
        .sort((a, b) => (a.d_day ?? 99) - (b.d_day ?? 99));
    case 'GET /todos/:id': return todos.find((t) => t.id === id);
    case 'PATCH /todos/:id': {
      const t = Object.assign(todos.find((x) => x.id === id)!, body, { done_at: body.done ? now() : null });
      const s = t.type === 'scholarship' && scholarships.find((x) => x.notice_id === t.source?.id);
      if (s) Object.assign(s, { applied: t.done, applied_at: t.done_at }); // 서버처럼 신청 내역에 기록
      return t;
    }
    case 'POST /todos': {
      const t: TodoDetail = { id: Date.now(), type: 'deadline', link: null, reason: '직접 등록한 일이에요.', source: null, ...body,
        d_day: body.due_date ? dday(body.due_date) : null, done: false, done_at: null };
      todos.push(t);
      return t;
    }
    case 'GET /scholarships': return [...scholarships].sort((a, b) => Number(b.applied) - Number(a.applied));
    case 'GET /scholarship-applications':
      return scholarships.filter((s) => s.applied).map((s): Application => ({ notice_id: s.notice_id, title: s.title, applied_at: s.applied_at! }));
    case 'GET /notices':
      return notices.map(({ id, title, category, deadline, posted_at, summary }) => ({ id, title, category, deadline, posted_at, summary: summary.slice(0, 1) }))
        .sort((a, b) => (b.posted_at ?? '').localeCompare(a.posted_at ?? ''));
    case 'GET /notices/:id': {
      const n = notices.find((x) => x.id === id) ?? notices[0];
      const s = scholarships.find((x) => x.notice_id === id);
      const todo = todos.find((t) => t.source?.kind === 'notice' && t.source.id === id && !t.done);
      return { ...n, eligibility: s ? { verdict: s.verdict, reasons: s.reasons } : null, todo_id: s?.applied ? null : todo?.id ?? null, applied: !!s?.applied };
    }
    case 'GET /calendar': return calendar();
    case 'GET /graduation': return graduation();
    case 'GET /grades': return grades;
    case 'POST /grades': case 'PUT /grades/:id': case 'DELETE /grades/:id':
      return { item: body, recalculated: { remaining_total: 9, new_eligible_scholarships: 0 } };
    case 'GET /courses': return [
      { id: 15, name: '모바일앱디자인', code: 'DS0201', credits: 3, area: '교양 선택', category: '일선', professor: '최디자인', room: '예지301', times: [{ day: '금', start: '10:00', end: '13:00' }] },
      { id: 14, name: '빅데이터개론', code: 'GE0302', credits: 2, area: '교양 선택', category: '교양', professor: '정정보', room: '청운201', times: [{ day: '목', start: '09:00', end: '11:00' }] },
    ];
    case 'GET /timetable': return timetable;
    case 'POST /timetable':
      if (body.course_id === 15) {
        const { ApiError } = await import('../lib/api');
        throw new ApiError(409, 'TIME_CONFLICT', '강의 시간 중복 (금요일 04교시)\n기존 수강 과목 [서경인성리더십]과 수업 시간대가 서로 겹칩니다.');
      }
      return {};
    case 'DELETE /timetable/:id': return {};
    case 'POST /chat': return chat(body);
    case 'GET /conversations': {
      const word = q.get('q') ?? '';
      return conversations.filter((c) => !word || c.title.includes(word) || c.messages.some((m) => m.text.includes(word)))
        .map(({ messages, ...c }) => c);
    }
    case 'GET /conversations/:id': return conversations.find((c) => c.id === id) ?? { id, title: '대화', pinned: false, updated_at: '', messages: [] };
    case 'PATCH /conversations/:id': return Object.assign(conversations.find((c) => c.id === id) ?? {}, body);
    case 'GET /notifications': return notifications;
    case 'PATCH /notifications/:id': return Object.assign(notifications.find((n) => n.id === id)!, body);
    // 분실물 (API 명세에 아직 없음)
    case 'GET /lost-items':
      if (q.get('matched_for') === 'me') return lostItems.filter((i) => i.kind === 'found' && i.match?.item_id === 951).sort((a, b) => b.match!.score - a.match!.score);
      return lostItems.filter((i) => !q.get('kind') || i.kind === q.get('kind'));
    case 'GET /lost-items/:id': return lostItems.find((i) => i.id === id);
    case 'GET /lost-items/:id/questions': return claimQuestions;
    case 'POST /lost-items/:id/claim': return { ok: true, message: '보관처(학생지원팀, 학생회관 1층)에서 평일 9~18시에 학생증을 보여 주고 받아 가세요.' };
    case 'POST /lost-items/analyze': return { title: '흰색 무선 이어폰 케이스', category: '전자기기', place: '', description: '흰색 플라스틱 케이스, 에어팟 추정 (AI 초안)' };
    case 'POST /lost-items': {
      lostItems.unshift({ id: Date.now(), kind: body.kind, title: body.title, category: body.category, place: body.place, found_at: now(),
        keep_at: body.keep_at ?? null, description: body.description ?? '', image_url: null, mine: true, status: 'open', match: null });
      return { matches: body.kind === 'lost' && body.category === '지갑' ? 2 : 0 };
    }
    default: throw new Error(`예시 데이터 없음: ${key}`);
  }
}
