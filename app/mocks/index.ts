// 서버 없이 화면을 만들 때 쓰는 예시 데이터 (EXPO_PUBLIC_USE_MOCK=1).
// 모양은 docs/04_API_명세.md 예시와 같음. 고친 내용은 앱을 다시 켜면 처음으로 돌아감.
import type { ChatReply, GradeTerm, Home, Me, Notification, Scholarship, TimetableEntry, TodoDetail } from '../lib/types';

const d = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

const me: Me = {
  nickname: '홍길동', department: '소프트웨어학과', minor: null, grade: 4, semester: 2, status: 'enrolled',
  admission_year: 2021, interests: ['장학금'], completed_requirements: ['졸업 영어 인증'],
  consent: { agreed: true, agreed_at: '2026-10-20T10:00:00+09:00' },
  notify: { notice: true, deadline: true, calendar: true, chat: true, time: '09:00' },
};

const todos: TodoDetail[] = [
  { id: 31, type: 'graduation', title: '졸업작품 심사 신청', due_date: d(0), d_day: 0, done: false,
    reason: "졸업 예정자는 '졸업작품 심사 신청'을(를) 마쳐야 해요. 아직 완료 기록이 없어요.", link: null,
    source: { kind: 'notice', id: 103 }, done_at: null },
  { id: 32, type: 'scholarship', title: '서경 AI 마일리지 장학금 신청', due_date: d(12), d_day: 12, done: false,
    reason: '신청 조건을 모두 충족해요. 4학년 (대상 2·3·4학년) ✓ · 직전 학기 평점 4.0 (기준 3.0 이상) ✓', link: null,
    source: { kind: 'notice', id: 104 }, done_at: null },
  { id: 33, type: 'deadline', title: '동계 계절학기 수강신청', due_date: d(14), d_day: 14, done: false,
    reason: '학적·학년이 공지 대상에 해당해요.', link: null, source: { kind: 'notice', id: 106 }, done_at: null },
  { id: 34, type: 'deadline', title: '캡스톤 영수증 제출', due_date: d(6), d_day: 6, done: false,
    reason: '채팅에서 알림을 받기로 한 일이에요.', link: null, source: null, done_at: null },
];

const scholarships: Scholarship[] = [
  { notice_id: 101, title: '2026-2학기 성적우수 장학금 (A종)', deadline: `${d(-30)}T18:00:00+09:00`, verdict: 'eligible',
    reasons: ['직전 학기 평점 4.0 (기준 3.5 이상) ✓'], applied: true, applied_at: '2026-09-15T10:00:00+09:00' },
  { notice_id: 102, title: '2026-2학기 국가장학금 2차 신청 안내', deadline: `${d(0)}T23:59:00+09:00`, verdict: 'check',
    reasons: ['소득분위 8구간 이하 — 앱이 알 수 없어 직접 확인이 필요해요'], applied: false, applied_at: null },
  { notice_id: 104, title: '서경 AI 마일리지 장학금 신청 안내', deadline: `${d(12)}T18:00:00+09:00`, verdict: 'eligible',
    reasons: ['4학년 (대상 2·3·4학년) ✓', '직전 학기 평점 4.0 (기준 3.0 이상) ✓'], applied: false, applied_at: null },
];

const NOTICE_BODY = `1. 신청 대상
- 재학생, 복학생, 신입생, 편입생 등
- 직전학기 12학점 이상 이수 및 B학점 이상

2. 신청 기간 및 방법
- 기간 : 오늘 18:00 마감
- 방법 : 한국장학재단 홈페이지 및 서경대 종합정보시스템

3. 제출 서류
- 가구원 정보제공 동의서 및 가족관계증명서`;

const grades: GradeTerm[] = [
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
  { id: 501, type: 'deadline', title: '졸업작품 심사 신청 마감이 오늘이에요', target_id: 31, read: false, sent_at: '2026-10-23T09:00:00+09:00' },
  { id: 502, type: 'notice', title: '서경 AI 마일리지 장학금 신청 안내 공지가 올라왔어요', target_id: 104, read: true, sent_at: '2026-10-22T09:05:00+09:00' },
];

const home = (): Home => ({
  nickname: me.nickname,
  unread_notifications: notifications.filter((n) => !n.read).length,
  briefing: '오늘 마감인 일 1개, 신청 가능한 장학금 1개가 있어요',
  today_todos: todos.filter((t) => !t.done).sort((a, b) => (a.d_day ?? 99) - (b.d_day ?? 99)),
  next_event: { id: 2, title: '중간고사 성적 확인', start_date: d(4), d_day: 4 },
  menu_status: { study: '졸업까지 9학점', scholarship: '신청 가능 1건', admin: '새 공지 2건', campus: '준비 중' },
  suggested_questions: ['졸업까지 뭐가 남았어?', '졸업작품 심사 신청은 언제까지야?', '장학금 신청 마감 언제야?'],
});

const chatReply = (text: string): ChatReply => ({
  conversation_id: 1,
  message: {
    id: Date.now(), role: 'assistant', created_at: new Date().toISOString(),
    text: text.includes('졸업') ? '졸업까지 9학점, 남은 요건 2가지예요. 졸업작품 심사 신청이 오늘 마감이에요.' : '(예시 답변) 학교 문서에 따르면 …',
    cards: text.includes('졸업') ? [{ image_url: null, title: '졸업까지 남은 학점', lines: ['9학점', '121 / 130'], link: null }] : [],
    sources: [{ title: '2026 학사요람 (예시)', url: null }],
    actions: [
      { type: 'open_screen', label: '졸업 요건 자세히', payload: { screen: 'L-2' } },
      { type: 'add_todo', label: '마감 알림 받기', payload: { title: '졸업작품 심사 신청', due_date: d(0) } },
    ],
  },
});

export async function mockFetch(method: string, path: string, body?: any): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 200)); // 로딩 화면 확인용
  const [p, qs] = path.split('?');
  const q = new URLSearchParams(qs);
  const id = Number(p.split('/')[2]);
  const key = `${method} ${p.replace(/\/\d+$/, '/:id')}`;
  switch (key) {
    case 'GET /me': return me;
    case 'PUT /me': return Object.assign(me, body, body.notify && { notify: { ...me.notify, ...body.notify } }); // 서버처럼 notify는 합치기
    case 'DELETE /me': return undefined;
    case 'GET /home': return home();
    case 'GET /todos':
      return todos.filter((t) => (!q.has('done') || String(t.done) === q.get('done')) && (!q.get('type') || t.type === q.get('type')));
    case 'GET /todos/:id': return todos.find((t) => t.id === id);
    case 'PATCH /todos/:id': {
      const t = Object.assign(todos.find((x) => x.id === id)!, body, { done_at: body.done ? new Date().toISOString() : null });
      const s = t.type === 'scholarship' && scholarships.find((x) => x.notice_id === t.source?.id);
      if (s) Object.assign(s, { applied: t.done, applied_at: t.done_at }); // 서버처럼 신청 내역에 기록
      return t;
    }
    case 'POST /todos': {
      const t: TodoDetail = { id: Date.now(), type: 'deadline', link: null, reason: '직접 등록한 일이에요.', source: null, ...body, d_day: null, done: false, done_at: null };
      todos.push(t);
      return t;
    }
    case 'GET /scholarships': return scholarships;
    case 'GET /scholarship-applications': return [];
    case 'GET /notices': return scholarships.map((s) => ({ id: s.notice_id, title: s.title, category: '장학', deadline: s.deadline, posted_at: null, summary: [s.reasons[0]] }));
    case 'GET /notices/:id': {
      const s = scholarships.find((x) => x.notice_id === id) ?? scholarships[0];
      return { id, title: s.title, category: '장학', deadline: s.deadline, posted_at: '2026-10-09T09:00:00+09:00',
        summary: ['소프트웨어학과 4학년 대상 · 소득분위 8구간 이하 신청 가능'], body: NOTICE_BODY,
        documents: ['신청서'], url: null, eligibility: { verdict: s.verdict, reasons: s.reasons }, todo_id: s.applied ? null : 32, applied: s.applied };
    }
    case 'GET /calendar': return [{ id: 2, title: '중간고사 성적 확인', start_date: d(4), end_date: d(6), description: null, d_day: 4 }];
    case 'GET /graduation':
      return { required_total: 130, earned_total: 121, remaining_total: 9,
        areas: [{ name: '전공', required: 66, earned: 60 }, { name: '교양 필수', required: 18, earned: 18 }],
        requirements: [{ name: '졸업 영어 인증', done: true }, { name: '졸업작품 심사 신청', done: false, todo_id: 31 }] };
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
    case 'POST /chat': return chatReply(body.text);
    case 'GET /conversations': return [{ id: 1, title: '졸업까지 뭐가 남았어?', pinned: false, updated_at: '2026-10-23T10:00:00+09:00' }];
    case 'GET /conversations/:id': return { id, title: '대화', pinned: false, updated_at: '', messages: [] };
    case 'PATCH /conversations/:id': return {};
    case 'GET /notifications': return notifications;
    case 'PATCH /notifications/:id': return Object.assign(notifications.find((n) => n.id === id)!, body);
    default: throw new Error(`예시 데이터 없음: ${key}`);
  }
}
