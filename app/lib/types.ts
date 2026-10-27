// 서버 응답 모양 (docs/04_API_명세.md와 같게 유지)

export type TodoType = 'deadline' | 'scholarship' | 'graduation' | 'status';
// ▶ FE 16번에 해당하는 부분: 할 일 종류 이름 (필터 칩·배지)
export const TODO_TYPE_KO: Record<TodoType, string> = { deadline: '마감', scholarship: '장학', graduation: '졸업', status: '학적' };
export type Verdict = 'eligible' | 'ineligible' | 'check';
export type NotifyType = 'notice' | 'deadline' | 'calendar' | 'chat';

export type Status = 'enrolled' | 'leave' | 'returned';
export const STATUS_KO: Record<Status, string> = { enrolled: '재학', leave: '휴학', returned: '복학' };

export type Me = {
  nickname: string;
  department: string | null;
  minor: string | null;
  grade: number | null;
  semester: number | null;
  status: Status;
  admission_year: number | null;
  interests: string[];
  completed_requirements: string[];
  consent: { agreed: boolean; agreed_at: string | null };
  // ▶ FE 9번: quiet = 방해 금지 시간 '22:00-07:00' (이 시간에는 푸시를 보내지 않음). API 명세에 없는 새 필드라 BE 확인 필요
  notify: { notice: boolean; deadline: boolean; calendar: boolean; chat: boolean; time: string; quiet?: string };
  // ▶ FE 11번에 해당하는 부분: M-5 '비서가 볼 정보'. API 명세에 없는 새 필드라 조장 확인 필요 (없으면 전부 켠 것으로 봄)
  assistant_scope?: AssistantScope;
};

/** FE 11번: 비서가 판단할 때 쓸 수 있는 내 정보 */
export type AssistantScope = { grades: boolean; timetable: boolean; status: boolean; chat_history: boolean };
export const DEFAULT_SCOPE: AssistantScope = { grades: true, timetable: true, status: true, chat_history: true };

export type Todo = {
  id: number;
  type: TodoType;
  title: string;
  due_date: string | null;
  d_day: number | null;
  done: boolean;
  done_at?: string | null;
};

export type TodoDetail = Todo & {
  reason: string | null;
  link: string | null;
  source: { kind: string; id: number | null } | null;
  done_at: string | null;
};

export type Home = {
  nickname: string;
  unread_notifications: number;
  today_todos: Todo[];
  next_event: { id: number; title: string; start_date: string; d_day: number } | null;
  menu_status: { study: string; scholarship: string; admin: string };
  suggested_questions: string[];
};

export type NoticeItem = {
  id: number;
  title: string;
  category: string | null;
  deadline: string | null;
  posted_at: string | null;
  summary: string[];
};

export type NoticeDetail = NoticeItem & {
  body: string;
  documents: string[];
  url: string | null;
  eligibility: { verdict: Verdict; reasons: string[] } | null;
  todo_id: number | null;
  applied: boolean;
};

export type Scholarship = {
  notice_id: number;
  title: string;
  deadline: string | null;
  verdict: Verdict;
  reasons: string[];
  applied: boolean;
  applied_at: string | null;
};

export type Application = { notice_id: number; title: string; applied_at: string };

export type CalendarEvent = {
  id: number;
  title: string;
  start_date: string;
  end_date: string | null;
  description: string | null;
  d_day: number;
};

export type Graduation = {
  required_total: number;
  earned_total: number;
  remaining_total: number;
  // ▶ FE 20번·21번: courses는 그 영역에서 들은 과목과 성적 (영역 카드를 펼치면 보임). API 명세에 없는 새 필드라 조장 확인 필요
  areas: { name: string; required: number; earned: number; courses?: AreaCourse[] }[];
  requirements: { name: string; done: boolean; todo_id?: number }[];
};

/** 졸업 영역에 들어간 과목 하나 (학기 "4-1", 성적 A+~F·P) */
export type AreaCourse = { term: string; course_name: string; credits: number; grade: string };

export type GradeItem = { id: number; term: string; course_name: string; credits: number; grade: string; area: string };
export type GradeTerm = { term: string; gpa: number | null; items: GradeItem[] };

export type ClassTime = { day: string; start: string; end: string };
export type Course = {
  id: number; name: string; code: string | null; credits: number; area: string;
  category: string | null; professor: string | null; room: string | null; times: ClassTime[];
};
export type TimetableEntry = {
  id: number; course_id: number | null; course_name: string; code: string | null; credits: number;
  category: string | null; professor: string | null; room: string | null; times: ClassTime[];
};

export type ChatCard = { image_url: string | null; title: string; lines: string[]; link: string | null };
export type ChatAction =
  | { type: 'add_todo'; label: string; payload: { title: string; due_date: string | null } }
  | { type: 'open_link'; label: string; payload: { url: string } }
  | { type: 'open_screen'; label: string; payload: { screen: string; id?: number } };
export type Message = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  cards: ChatCard[];
  sources: { title: string; url: string | null }[];
  actions: ChatAction[];
  created_at: string;
};
export type ChatReply = { conversation_id: number; message: Message };
// ▶ FE 34번에 해당하는 부분: category는 대화 기록 분류 칩(시안 06 ⑤)용. 서버가 안 주면 앱이 제목으로 추측
export type Conversation = { id: number; title: string; pinned: boolean; updated_at: string; preview?: string; category?: ChatCategory };
export type ChatCategory = '수업/졸업' | '장학금' | '학사 행정' | '기타';

export type Notification = {
  id: number;
  type: NotifyType;
  title: string;
  target_id: number | null;
  read: boolean;
  sent_at: string;
};
