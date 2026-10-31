// ▶ FE 3번에 해당하는 부분: 예시 데이터 (USE_MOCK=1이면 서버 대신 이 값을 돌려줌)
// 서버 없이 화면을 만들 때 쓰는 예시 데이터 (EXPO_PUBLIC_USE_MOCK=1).
// 모양은 docs/04_API_명세.md 예시와 같음. 내 정보는 학생별로 저장되고, 그 밖의 고친 내용은 앱을 다시 켜면 처음으로 돌아감.
// 시연용 가상 학생 4명 중 누구로 로그인했는지에 따라 이름·학과·학년이 바뀜 (나머지 예시는 같음)
import { DEV_PASSWORD, PERSONAS } from '../lib/config';
import { overall } from '../lib/format';
import { ApiError } from '../lib/errors';
import { checkAdd } from '../lib/schedule';
import { getToken } from '../lib/session';
import type {
  Application, AreaCourse, CalendarEvent, ChatCard, Course, GradeItem, Graduation, ChatReply, Conversation, GradeTerm, Home, Me, Message,
  NoticeDetail, Notification, Scholarship, TimetableEntry, TodoDetail,
} from '../lib/types';

const d = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
const dday = (date: string) => Math.round((new Date(date + 'T00:00:00').getTime() - new Date(d(0) + 'T00:00:00').getTime()) / 864e5);
const now = () => new Date().toISOString();

// ---- ▶ FE 7번에 해당하는 부분: 계정 (로그인·회원가입·비밀번호 변경) ----
// 가상 학생 4명(학번 + 비밀번호 DEV_PASSWORD)에, 회원가입한 계정이 더해짐. 이 기기(브라우저·휴대폰 저장소)에만 저장되는 시연용
type Account = { id: string; studentId: string; name: string; email: string; password: string };
const ACCOUNT_KEY = 'mock-accounts-v1';
const accounts: Account[] = PERSONAS.map((p) => ({ id: p.id, studentId: p.studentId, name: p.name, email: `${p.studentId}@skuniv.ac.kr`, password: DEV_PASSWORD }));
try {
  // 저장된 것(바꾼 비밀번호, 새로 가입한 계정)으로 덮어씀
  for (const a of JSON.parse(globalThis.localStorage?.getItem(ACCOUNT_KEY) ?? '[]') as Account[]) {
    const i = accounts.findIndex((x) => x.id === a.id);
    if (i >= 0) accounts[i] = a;
    else accounts.push(a);
  }
} catch {}
function saveAccounts() {
  try {
    globalThis.localStorage?.setItem(ACCOUNT_KEY, JSON.stringify(accounts));
  } catch {}
}
const authFail = (message: string) => new ApiError(400, 'AUTH', message);
const signupCodes: Record<string, string> = {}; // 이메일 → 보낸 인증번호
const verified = new Set<string>(); // 인증을 마친 이메일

/** lib/auth.ts가 예시 데이터 모드에서 부르는 곳. 로그인 성공이면 토큰(dev-<계정 번호>)을 돌려줌 */
export const mockAuth = {
  signIn(id: string, password: string) {
    const a = accounts.find((x) => x.studentId === id || x.email === id.toLowerCase());
    if (!a || a.password !== password) throw authFail('아이디 또는 비밀번호가 맞지 않아요. 다시 확인해 주세요.');
    return `dev-${a.id}`;
  },
  sendCode(email: string) {
    if (accounts.some((a) => a.email === email)) throw authFail('이미 가입한 이메일이에요. 로그인해 주세요.');
    const code = String(Math.floor(100000 + Math.random() * 900000));
    signupCodes[email] = code;
    verified.delete(email);
    return code;
  },
  verifyCode(email: string, code: string) {
    if (!signupCodes[email] || signupCodes[email] !== code) throw authFail('인증번호가 맞지 않아요.');
    verified.add(email);
  },
  signUp(a: { name: string; email: string; password: string }) {
    if (!verified.has(a.email)) throw authFail('이메일 인증을 먼저 해 주세요.');
    const account = { ...a, studentId: a.email.split('@')[0], id: `mock-${Date.now()}` };
    accounts.push(account);
    saveAccounts();
    return `dev-${account.id}`; // 내 정보가 없어서 처음 설정(M-2)부터 시작
  },
  changePassword(current: string, next: string) {
    const a = accounts.find((x) => x.id === currentId());
    if (!a || a.password !== current) throw authFail('지금 비밀번호가 맞지 않아요.');
    a.password = next;
    saveAccounts();
  },
};

// ---- 학생별 내 정보 (학생마다 따로 저장) ----
// 마이페이지에서 고친 학적·알림 설정은 그 학생에게만 남고, 로그아웃·새로고침해도 유지됨(브라우저·휴대폰 저장소).
// 계정을 삭제하면 그 학생 정보가 지워져서, 다시 로그인하면 처음 설정(M-2)부터 시작함. 새로 가입한 계정도 처음 설정부터
const PROFILE_KEY = 'mock-profiles-v1';
const BASE: Me = {
  nickname: '홍길동', department: '소프트웨어학과', minor: null, grade: 4, semester: 2, status: 'enrolled',
  admission_year: 2021, interests: ['장학금'], completed_requirements: ['졸업 영어 인증'],
  consent: { agreed: true, agreed_at: '2026-10-20T10:00:00+09:00' },
  notify: { notice: true, deadline: true, calendar: true, chat: true, time: '08:00', quiet: '22:00-07:00' },
  assistant_scope: { grades: true, timetable: true, status: true, chat_history: true },
};
/** 처음 상태: 가상 학생은 config의 설명("1학년 · 소프트웨어학과")대로, 새로 가입한 계정은 이름만 */
function defaultProfile(id: string): Me {
  const p = PERSONAS.find((x) => x.id === id);
  const name = accounts.find((a) => a.id === id)?.name ?? '';
  if (!p) return { ...BASE, nickname: name, grade: 1, admission_year: 2026, completed_requirements: [], notify: { ...BASE.notify } };
  const [grade, dept] = p.desc.split(' · ');
  const g = Number(grade[0]);
  return { ...BASE, nickname: p.name, department: dept, grade: g, admission_year: 2026 - g + 1, notify: { ...BASE.notify } };
}
function loadProfiles(): Record<string, Me | null> {
  let saved: Record<string, Me | null> = {};
  try {
    saved = JSON.parse(globalThis.localStorage?.getItem(PROFILE_KEY) ?? '{}');
  } catch {}
  return { ...Object.fromEntries(PERSONAS.map((p) => [p.id, defaultProfile(p.id)])), ...saved };
}
const profiles = loadProfiles();
function saveProfiles() {
  try {
    globalThis.localStorage?.setItem(PROFILE_KEY, JSON.stringify(profiles));
  } catch {}
}
/** 지금 로그인한 계정 번호 (dev-<id> 토큰). 모르면 홍길동 */
const currentId = () => accounts.find((a) => getToken() === `dev-${a.id}`)?.id ?? PERSONAS[3].id;

// 아래 예시 데이터가 쓰는 '지금 학생 정보'. 요청마다 applyPersona()로 맞춤
let me: Me = profiles[currentId()] ?? BASE;
function applyPersona() {
  me = profiles[currentId()] ?? { ...BASE, nickname: '' };
}

/** 로그인 화면의 '시연용 계정'에 보여 줄 설명: 지금 저장된 학년·학과, 삭제했으면 그렇다고 */
export function mockPersonaDesc(id: string) {
  const pr = profiles[id];
  return pr ? `${pr.grade}학년 · ${pr.department}${pr.status !== 'enrolled' ? ` · ${pr.status === 'leave' ? '휴학' : '복학'}` : ''}` : '탈퇴함 · 로그인하면 처음 설정부터';
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
    reason: '오늘 23:59 마감이에요.\n재학생 ✓\n직접 확인이 필요해요\n· 소득분위\n· 가구원 정보제공 동의', link: 'https://www.kosaf.go.kr',
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

// 영역별로 들은 과목 (학기, 과목명, 학점, 성적). 합계가 위 이수 학점과 같게 맞춤
const course = (term: string, course_name: string, credits: number, grade: string): AreaCourse => ({ term, course_name, credits, grade });
const AREA_COURSES: Record<string, AreaCourse[]> = {
  '전공 필수': [
    course('1-1', '프로그래밍기초', 3, 'A+'), course('1-2', '자료구조', 3, 'A0'), course('2-1', '컴퓨터구조', 3, 'B+'), course('2-1', '이산수학', 3, 'A0'),
    course('2-2', '알고리즘', 3, 'A+'), course('2-2', '객체지향프로그래밍', 3, 'A0'), course('3-1', '운영체제', 3, 'B+'), course('3-1', '데이터베이스', 3, 'A0'),
    course('3-2', '컴퓨터네트워크', 3, 'B0'), course('3-2', '소프트웨어공학', 3, 'A0'), course('4-1', '캡스톤디자인I', 3, 'A+'), course('4-1', '정보보호개론', 3, 'A0'),
  ],
  '전공 선택': [
    course('2-1', '웹프로그래밍', 3, 'A+'), course('2-2', '리눅스시스템', 3, 'B+'), course('2-2', '모바일프로그래밍', 3, 'A0'), course('3-1', '인공지능개론', 3, 'B+'),
    course('3-1', '컴파일러', 3, 'B0'), course('3-1', '클라우드컴퓨팅', 3, 'A0'), course('3-2', '머신러닝', 3, 'A0'), course('3-2', '빅데이터처리', 3, 'A+'),
    course('3-2', '컴퓨터그래픽스', 3, 'B+'), course('4-1', '딥러닝응용', 3, 'A0'), course('4-1', '분산시스템', 3, 'B+'), course('4-1', '자연어처리', 3, 'A+'),
    course('2-1', '시스템프로그래밍', 3, 'B+'), course('1-2', '파이썬프로그래밍', 3, 'A+'), course('4-1', '블록체인기초', 3, 'P'),
  ],
  '교양 필수': [
    course('1-1', '글쓰기와 소통', 2, 'A+'), course('1-1', '서경인성리더십', 1, 'P'), course('1-1', '대학영어I', 3, 'B+'), course('1-2', '대학영어II', 3, 'A0'),
    course('1-2', '미적분학', 3, 'B0'), course('2-1', '진로탐색', 1, 'P'), course('2-1', '사회봉사', 2, 'P'), course('2-2', '창의적사고', 3, 'A0'),
  ],
  '교양 선택': [
    course('1-1', '심리학의 이해', 3, 'A0'), course('1-2', '현대사회와 윤리', 3, 'B+'), course('2-1', '경제학원론', 3, 'B0'), course('2-2', '디자인씽킹', 3, 'A+'),
    course('3-1', '영화로 보는 역사', 2, 'A0'), course('3-2', '생활 속 통계', 3, 'A0'), course('3-2', '창업과 리더십', 2, 'B+'), course('4-1', '세계 문화 이해', 3, 'A+'),
  ],
};

// 성적 기록 하나 = 졸업 영역에 들어간 과목 하나. 성적 탭(학기별)과 졸업 탭(영역별)이 같은 기록을 씀
// 고치면(POST·PUT·DELETE /grades) 졸업 학점·영역별 과목이 같이 바뀜 (서버의 재계산 흉내)
let gradeSeq = 1;
const gradeItems: GradeItem[] = Object.entries(AREA_COURSES).flatMap(([area, list]) => list.map((c) => ({ id: gradeSeq++, area, ...c })));
const AREA_REQUIRED: Record<string, number> = { '전공 필수': 39, '전공 선택': 45, '교양 필수': 18, '교양 선택': 28 };
/** 예전 이수 영역 값('전공')은 전공 선택으로 봄 */
const areaOf = (a: string) => (a === '전공' ? '전공 선택' : a);
const earnedOf = (items: GradeItem[]) => items.filter((g) => g.grade !== 'F').reduce((n, g) => n + g.credits, 0);

function gradeTerms(): GradeTerm[] {
  const terms = [...new Set(gradeItems.map((g) => g.term))].sort();
  return terms.map((term) => {
    const items = gradeItems.filter((g) => g.term === term);
    return { term, gpa: overall([{ term, gpa: null, items }]).gpa, items };
  });
}

/** 서버에 졸업 기준이 있는 학과 (예시 데이터 기준) */
const hasGradRules = () => ['소프트웨어학과', '전자컴퓨터공학과'].includes(me.department ?? '');

const graduation = () => {
  const areas = Object.entries(AREA_REQUIRED).map(([name, required]) => {
    const items = gradeItems.filter((g) => areaOf(g.area) === name);
    return { name, required, earned: earnedOf(items), courses: items.map(({ term, course_name, credits, grade }) => ({ term, course_name, credits, grade })) };
  });
  // 영역별로 기준을 넘긴 학점은 졸업 학점에 더 쳐주지 않음
  const earned_total = areas.reduce((n, a) => n + Math.min(a.earned, a.required), 0);
  const required_total = 130;
  return gradTail(areas, required_total, earned_total);
};

const gradTail = (areas: Graduation['areas'], required_total: number, earned_total: number): Graduation => ({
  required_total, earned_total, remaining_total: Math.max(0, required_total - earned_total), areas,
  requirements: [
    { name: '졸업 영어 인증', done: true },
    { name: '졸업작품 심사 신청', done: todos.find((t) => t.id === 31)!.done, todo_id: 31 },
    { name: '졸업 논문(보고서) 최종본 제출', done: todos.find((t) => t.id === 35)!.done, todo_id: 35 },
  ],
});


const timetable: TimetableEntry[] = [
  { id: 1, course_id: 1, course_name: '캡스톤디자인II', code: 'CS0401', credits: 3, category: '전필', professor: '김서경', room: '북304',
    times: [{ day: '월', start: '10:00', end: '12:00' }, { day: '수', start: '09:00', end: '10:00' }] },
  { id: 2, course_id: 2, course_name: '인공지능개론', code: 'CS0312', credits: 3, category: '전선', professor: '이박사', room: '유담102',
    times: [{ day: '화', start: '12:00', end: '14:00' }, { day: '목', start: '12:00', end: '13:00' }] },
  { id: 3, course_id: 3, course_name: '빅데이터분석', code: 'CS0355', credits: 3, category: '전선', professor: '박데이터', room: '정보301',
    times: [{ day: '수', start: '13:00', end: '16:00' }] },
  { id: 4, course_id: 16, course_name: '서경인성리더십', code: 'GE0101', credits: 1, category: '교양', professor: '서경인', room: '청운홀',
    times: [{ day: '금', start: '13:00', end: '14:00' }] },
];

// 개설 과목 (과목 검색 L-5). 모바일앱디자인은 금 03~05교시라 서경인성리더십(금 05교시)과 겹침 → 등록 불가 창 확인용
const COURSES: Course[] = [
  { id: 15, name: '모바일앱디자인', code: 'DS0201', credits: 3, area: '교양 선택', category: '일선', professor: '최디자인', room: '예지301', times: [{ day: '금', start: '11:00', end: '14:00' }] },
  { id: 3, name: '빅데이터분석', code: 'CS0355', credits: 3, area: '전공', category: '전선', professor: '박데이터', room: '정보301', times: [{ day: '수', start: '13:00', end: '16:00' }] },
  { id: 14, name: '빅데이터개론', code: 'GE0302', credits: 2, area: '교양 선택', category: '교양', professor: '정정보', room: '청운201', times: [{ day: '목', start: '09:00', end: '11:00' }] },
  { id: 4, name: '금융빅데이터응용', code: 'CS0388', credits: 3, area: '전공', category: '전선', professor: '이금융', room: '정보202', times: [{ day: '화', start: '10:00', end: '12:00' }] },
  { id: 21, name: '소프트웨어설계', code: 'CS0410', credits: 3, area: '전공', category: '전선', professor: '한설계', room: '북401', times: [{ day: '목', start: '14:00', end: '17:00' }] },
  { id: 22, name: '모바일프로그래밍', code: 'CS0322', credits: 3, area: '전공', category: '전선', professor: '윤앱', room: '정보305', times: [{ day: '월', start: '14:00', end: '17:00' }] },
  { id: 24, name: '영화와 인문학', code: 'GE0510', credits: 2, area: '교양 선택', category: '교양', professor: '이인문', room: '청운103', times: [{ day: '수', start: '10:00', end: '12:00' }] },
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
  const eligible = scholarships.filter((s) => !s.applied && s.verdict === 'eligible').length;
  const next = calendar().filter((e) => e.d_day >= 0).sort((a, b) => a.d_day - b.d_day)[0];
  const newNotices = notices.filter((n) => n.posted_at && dday(n.posted_at.slice(0, 10)) >= -3).length;
  return {
    nickname: me.nickname,
    unread_notifications: notifications.filter((n) => !n.read).length,
    today_todos: open.slice(0, 9),
    next_event: next ? { id: next.id, title: next.title, start_date: next.start_date, d_day: next.d_day } : null,
    menu_status: {
      study: hasGradRules() ? `졸업까지 ${graduation().remaining_total}학점` : '적용 졸업 기준 확인 필요',
      scholarship: `신청 가능 ${eligible}건${scholarships.some((s) => !s.applied && s.verdict !== 'ineligible' && s.deadline?.startsWith(d(0))) ? ' · 오늘 마감' : ''}`,
      admin: `새 공지 ${newNotices}건`,
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
      text: `'${t.title}'은(는) ${t.due_date ?? '마감 없음'}까지예요.\n${t.reason ?? ''}\n아래 버튼으로 바로 처리할 수 있어요.`,
      cards: [], sources: [HAKSA],
      actions: [
        ...(t.link ? [{ type: 'open_link' as const, label: '신청 페이지', payload: { url: t.link } }] : []),
        { type: 'open_screen', label: '할 일 자세히', payload: { screen: 'T-2', id: t.id } },
      ],
    };
  }
  if (/휴학|복학/.test(q)) {
    const e = calendar()[/복학/.test(q) ? 3 : 4]; // 묻는 쪽(휴학·복학)의 신청 기간
    const title = e.title.replace(/ 기간$/, '');
    return {
      text: '일반휴학은 한 번에 최대 2학기, 통산 6학기까지 할 수 있어요.\n· 휴학 중에는 재학생 대상 교내 장학금 신청 불가\n· 복학한 학기부터 장학금 다시 판정\n· 신청은 학사일정의 신청 기간에',
      cards: [{ image_url: null, title: e.title, lines: [e.start_date, `${e.end_date}까지`], link: null }],
      sources: [HAKSA, { title: '2027-1학기 휴·복학 신청 안내', url: 'https://www.skuniv.ac.kr' }],
      actions: [
        { type: 'add_todo', label: '마감 알림 받기', payload: { title, due_date: e.end_date } },
        { type: 'open_screen', label: '휴·복학 안내', payload: { screen: 'A-3' } },
      ],
    };
  }
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
        ...g.areas.map((a) => `${(a.earned ?? 0) >= a.required ? '✓' : '○'} ${a.name} ${a.earned} / ${a.required}`)], link: null }],
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
    // 오늘 마감 개수만 말하고, 없으면 그렇다고 함 (0개인 부분은 빼고 말함)
    const todayCount = h.today_todos.filter((t) => t.d_day === 0).length;
    return {
      text: h.today_todos.length
        ? `${todayCount ? `오늘 마감인 일이 ${todayCount}개 있어요. ` : ''}가장 급한 일부터 정리했어요.`
        : '오늘은 급하게 챙길 일이 없어요. 여유로운 하루 보내세요!',
      cards: h.today_todos.slice(0, 3).map((t): ChatCard => ({ image_url: null, title: t.title, lines: [t.d_day === 0 ? '오늘 마감' : `D-${t.d_day}`, t.due_date ?? ''], link: null })),
      sources: [], actions: [{ type: 'open_screen', label: '할 일 전체 보기', payload: { screen: 'T-1' } }],
    };
  }
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
  { id: 5, title: '동계 계절학기 수강신청 일정', pinned: false, updated_at: `${d(-9)}T09:40:00+09:00`, preview: '앞으로 2주 안의 학사 일정은…', messages: [] },
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

// 분실물 예시 (답: 노란색)
const lostItems: any[] = [{
  id: 1, created_at: '2026-10-29T09:00:00+09:00', title: '검은색 에어팟 케이스', category: '전자기기', place: '북악관 3층 복도',
  found_on: '2026-10-29', description: '', image_url: null, question: '케이스에 붙은 스티커 색은?', answer: '노란색',
  storage_place: '학생지원팀(북악관 1층)', status: 'open', mine: false, solved: false,
}, {
  id: 2, created_at: '2026-10-27T09:00:00+09:00', title: '갈색 가죽 지갑', category: '지갑·카드', place: '도서관 2층',
  found_on: '2026-10-27', description: '', image_url: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#8a5a2b"/><rect x="1" y="1" width="2" height="1" fill="#f2d7a6"/></svg>')}`, question: '지갑 안 학생증 이름은?', answer: '홍길동',
  storage_place: '도서관 대출대', status: 'closed', mine: false, solved: false,
}];

/** 서버처럼: 없는 id면 404 (예전에는 다른 공지를 대신 보여 줬음) */
function found<T>(x: T | undefined): T {
  if (x === undefined) throw new ApiError(404, 'NOT_FOUND', '찾을 수 없어요. 지워졌거나 주소가 바뀌었을 수 있어요.');
  return x;
}

export async function mockFetch(method: string, path: string, body?: any): Promise<unknown> {
  await new Promise((r) => setTimeout(r, method === 'POST' && path === '/chat' ? 900 : 200)); // 로딩·'답변 작성 중' 확인용
  applyPersona();
  const [p, qs] = path.split('?');
  const q = new URLSearchParams(qs);
  const id = Number(p.split('/')[2]);
  const key = `${method} ${p.replace(/\/\d+/, '/:id')}`;
  switch (key) {
    case 'GET /me': case 'GET /home': {
      if (!profiles[currentId()]) {
        // 서버처럼: 처음 쓰는(또는 탈퇴한) 학생 → 앱이 처음 설정(M-2)으로 보냄
        throw new ApiError(404, 'NO_PROFILE', '처음 설정이 필요해요');
      }
      return key === 'GET /me' ? me : home();
    }
    case 'PUT /me': {
      const id = currentId();
      const base = profiles[id] ?? { ...defaultProfile(id), consent: { agreed: false, agreed_at: null } };
      const next: Me = { ...base, ...body, notify: { ...base.notify, ...body.notify } }; // 서버처럼 notify는 합치기
      if (body.consent?.agreed) next.consent = { agreed: true, agreed_at: now() };
      profiles[id] = next;
      saveProfiles();
      applyPersona();
      return next;
    }
    case 'DELETE /me': {
      // 서버처럼: 성적을 포함한 그 학생의 정보를 지움 (예시 데이터라 지금은 내 정보만 지움)
      profiles[currentId()] = null;
      saveProfiles();
      return undefined;
    }
    case 'GET /todos':
      return todos.filter((t) => mine(t) && (!q.has('done') || String(t.done) === q.get('done')) && (!q.get('type') || t.type === q.get('type')))
        .sort((a, b) => (a.d_day ?? 99) - (b.d_day ?? 99));
    case 'GET /todos/:id': return found(todos.find((t) => t.id === id));
    case 'PATCH /todos/:id': {
      const t = Object.assign(found(todos.find((x) => x.id === id)), body, { done_at: body.done ? now() : null });
      const s = t.type === 'scholarship' && scholarships.find((x) => x.notice_id === t.source?.id);
      if (s) Object.assign(s, { applied: t.done, applied_at: t.done_at }); // 서버처럼 신청 내역에 기록
      return t;
    }
    case 'POST /todos': {
      const t: TodoDetail = { type: 'deadline', link: null, reason: '직접 등록한 일이에요.', source: null, ...body, id: Date.now(),
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
      const n = found(notices.find((x) => x.id === id));
      const s = scholarships.find((x) => x.notice_id === id);
      const todo = todos.find((t) => t.source?.kind === 'notice' && t.source.id === id);
      return { ...n, eligibility: s ? { verdict: s.verdict, reasons: s.reasons } : null, todo_id: todo?.id ?? null, applied: !!s?.applied };
    }
    case 'GET /calendar': return calendar();
    case 'GET /graduation':
      // 서버처럼: 졸업 기준이 있는 학과가 아니면 404
      if (!hasGradRules()) throw new ApiError(404, 'GRADUATION_RULES_NOT_FOUND', '이 학과·입학년도의 적용 졸업 기준은 확인 중이에요.');
      return graduation();
    case 'GET /grades': return gradeTerms();
    case 'POST /grades/from-file': return { dropped: 1, items: [
      { term: '4-1', course_name: '시험용 자료구조', credits: 3, grade: 'A0', area: '전공 필수' },
      { term: '4-1', course_name: '시험용 심리학', credits: 2, grade: 'B+', area: '교양 선택' }] };
    case 'POST /grades': case 'PUT /grades/:id': case 'DELETE /grades/:id': {
      const before = graduation().areas.filter((a) => (a.earned ?? 0) >= a.required).length;
      let item: GradeItem | null = null;
      if (method === 'POST') gradeItems.push((item = { id: gradeSeq++, ...body, area: areaOf(body.area) }));
      else {
        const i = gradeItems.findIndex((g) => g.id === id);
        if (i < 0) throw new Error('없는 성적이에요');
        if (method === 'PUT') item = Object.assign(gradeItems[i], body, { area: areaOf(body.area) });
        else gradeItems.splice(i, 1);
      }
      const g = graduation();
      return { item, recalculated: { remaining_total: g.remaining_total, new_eligible_scholarships: 0,
        completed_areas: g.areas.filter((a) => (a.earned ?? 0) >= a.required).length - before } };
    }
    case 'GET /courses': {
      // 과목명 또는 과목코드로 찾기
      const word = (q.get('q') ?? '').trim().toLowerCase();
      return COURSES.filter((c) => !word || c.name.toLowerCase().includes(word) || (c.code ?? '').toLowerCase().includes(word));
    }
    case 'GET /timetable': return timetable;
    case 'POST /timetable': {
      // 서버처럼: 과목 검색이면 개설 과목에서 찾고, 직접 입력이면 보낸 내용 그대로. 겹치거나 학점을 넘으면 409
      const c = body.course_id ? COURSES.find((x) => x.id === body.course_id) : null;
      const entry: TimetableEntry = c
        ? { id: Date.now(), course_id: c.id, course_name: c.name, code: c.code, credits: c.credits, category: c.category, professor: c.professor, room: c.room, times: c.times }
        : { id: Date.now(), course_id: null, code: null, room: null, professor: null, ...body };
      const problem = checkAdd(timetable, entry);
      if (problem) {
        throw new ApiError(409, problem.code, problem.lines.join('\n'));
      }
      timetable.push(entry);
      return entry;
    }
    case 'DELETE /timetable/:id': {
      const i = timetable.findIndex((e) => e.id === id);
      if (i >= 0) timetable.splice(i, 1);
      return {};
    }
    case 'POST /chat': return chat(body);
    case 'GET /conversations': {
      const word = q.get('q') ?? '';
      return conversations.filter((c) => !word || c.title.includes(word) || c.messages.some((m) => m.text.includes(word)))
        .map(({ messages, ...c }) => c);
    }
    case 'GET /conversations/:id': return conversations.find((c) => c.id === id) ?? { id, title: '대화', pinned: false, updated_at: '', messages: [] };
    case 'PATCH /conversations/:id': return Object.assign(conversations.find((c) => c.id === id) ?? {}, body);
    case 'PATCH /messages/:id/feedback': return { id, feedback: body.feedback };
    case 'GET /notifications': return notifications;
    case 'PATCH /notifications/:id': return Object.assign(notifications.find((n) => n.id === id)!, body);
    // 분실물: 서버처럼 보관 장소는 내 글이거나 답을 맞혔을 때만 (예시라 남은 기회는 안 셈)
    case 'GET /lost-items':
      return lostItems.filter((x) => x.status === (q.get('status') ?? 'open') && (!q.get('category') || x.category === q.get('category'))
        && (!q.get('q') || [x.title, x.place, x.description].join(' ').includes(q.get('q')!))).map(({ answer, storage_place, ...x }) => x);
    case 'GET /lost-items/:id': {
      const { answer, storage_place, ...x } = found(lostItems.find((i) => i.id === id));
      return { ...x, storage_place: x.mine || x.solved ? storage_place : null, tries_left: 3 };
    }
    case 'POST /lost-items': {
      const { image_base64, ...rest } = body;
      const x = { ...rest, id: Date.now(), created_at: now(), image_url: null, status: 'open', mine: true, solved: false };
      lostItems.unshift(x);
      return { ...x, tries_left: 3 };
    }
    case 'POST /lost-items/:id/claim': {
      const x = found(lostItems.find((i) => i.id === id));
      const norm = (s: string) => s.replace(/\s/g, '').toLowerCase();
      if (norm(body.answer) !== norm(x.answer)) throw new ApiError(400, 'WRONG_ANSWER', '답이 맞지 않아요. 남은 기회 2번');
      x.solved = true;
      return { storage_place: x.storage_place, tries_left: 3 };
    }
    case 'PATCH /lost-items/:id': return Object.assign(found(lostItems.find((i) => i.id === id)), body);
    case 'DELETE /lost-items/:id': {
      lostItems.splice(lostItems.findIndex((i) => i.id === id), 1);
      return undefined;
    }
    default: throw new Error(`예시 데이터 없음: ${key}`);
  }
}
