-- 001_init.sql : 서경 AI 비서 데이터 표 (docs/05_데이터_표.md 기준)
-- Supabase SQL Editor에 그대로 붙여 넣어 실행하면 됩니다.
-- 앱은 표에 직접 접근하지 않고 우리 서버(FastAPI)만 접근합니다.
-- 그래서 모든 표에 RLS를 켜고 공개 정책은 만들지 않습니다 = 앱의 anon 키로는 아무것도 못 읽음.

create extension if not exists vector;

-- ── 학생 정보 ─────────────────────────────────────────────
create table profiles (
  id                bigint generated always as identity primary key,
  user_id           uuid not null unique,            -- Supabase 로그인 계정 id
  email             text,
  nickname          text not null default '',
  department        text,
  minor             text,
  grade             int check (grade between 1 and 6),
  semester          int check (semester in (1, 2)),
  status            text not null default 'enrolled' check (status in ('enrolled', 'leave', 'returned')),
  admission_year    int,                              -- 학번 전체 대신 입학년도만
  interests         text[] not null default '{}',
  completed_requirements text[] not null default '{}', -- 끝낸 졸업 인증 이름 (예: '졸업 영어 인증')
  consent_agreed_at timestamptz,
  notify_notice     boolean not null default true,
  notify_deadline   boolean not null default true,
  notify_calendar   boolean not null default true,
  notify_chat       boolean not null default true,
  notify_time       time not null default '09:00',
  push_token        text,
  created_at        timestamptz not null default now()
);

-- ── 학교 정보 (시드 스크립트로 넣음) ──────────────────────
create table courses (
  id         bigint generated always as identity primary key,
  name       text not null,
  credits    int not null,
  area       text not null,                 -- 전공 / 교양 필수 / 교양 선택 ...
  department text,
  times      jsonb not null default '[]',   -- [{"day":"화","start":"10:30","end":"12:00"}]
  created_at timestamptz not null default now()
);

create table grades (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references profiles(user_id) on delete cascade,
  term        text not null,                -- '4-1' = 4학년 1학기
  course_name text not null,
  credits     int not null check (credits between 0 and 9),
  grade       text not null check (grade in ('A+','A0','B+','B0','C+','C0','D+','D0','F','P')),
  area        text not null,
  created_at  timestamptz not null default now()
);

create table timetable (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references profiles(user_id) on delete cascade,
  course_id   bigint references courses(id) on delete set null,  -- 직접 입력이면 null
  course_name text not null,
  credits     int not null,
  times       jsonb not null default '[]',
  created_at  timestamptz not null default now()
);

create table grad_requirements (
  id               bigint generated always as identity primary key,
  department       text not null,
  admission_year   int,                       -- null = 해당 학과 기본 기준
  total_credits    int not null,
  areas            jsonb not null,            -- [{"name":"전공","required":66}]
  required_courses jsonb not null default '[]',
  certifications   jsonb not null default '[]', -- ["졸업 영어 인증", "졸업작품 심사 신청"]
  created_at       timestamptz not null default now()
);

create table academic_calendar (
  id            bigint generated always as identity primary key,
  title         text not null,
  start_date    date not null,
  end_date      date,
  target_grades int[],                        -- null = 전 학년
  description   text,
  created_at    timestamptz not null default now()
);

create table documents (
  id         bigint generated always as identity primary key,
  title      text not null,
  url        text,
  kind       text not null,                   -- 학사요람 / 규정 / 공지
  created_at timestamptz not null default now()
);

-- 임베딩 크기 768 = EmbeddingGemma, multilingual-e5-base 기준. 모델이 바뀌면 숫자도 바꿔야 함.
create table doc_chunks (
  id          bigint generated always as identity primary key,
  document_id bigint not null references documents(id) on delete cascade,
  content     text not null,
  embedding   vector(768),                    -- 가짜 AI 모드에서는 비어 있고 글자 검색으로 대신함
  created_at  timestamptz not null default now()
);

-- ── 공지와 비서 계산 결과 ─────────────────────────────────
create table notices (
  id            bigint generated always as identity primary key,
  board_post_id text not null unique,         -- 같은 글을 두 번 수집하지 않게
  title         text not null,
  body          text not null default '',
  url           text,
  posted_at     timestamptz,
  category      text,                         -- 장학 / 학사 / 일반 (AI 정리)
  summary       jsonb not null default '[]',  -- 3줄 요약
  deadline      timestamptz,
  documents     jsonb not null default '[]',  -- 제출 서류
  target        jsonb not null default '{}',  -- {"grades":[3,4],"departments":[],"statuses":["enrolled"]}
  conditions    jsonb not null default '{}',  -- {"min_gpa":3.5,"min_credits":12,"income_max":8}
  processed_at  timestamptz,                  -- AI 정리가 끝난 시각 (null = 아직)
  created_at    timestamptz not null default now()
);

create table eligibility (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references profiles(user_id) on delete cascade,
  notice_id  bigint not null references notices(id) on delete cascade,
  verdict    text not null check (verdict in ('eligible', 'ineligible', 'check')),
  reasons    jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, notice_id)
);

create table todos (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references profiles(user_id) on delete cascade,
  type        text not null check (type in ('deadline', 'scholarship', 'graduation', 'status')),
  title       text not null,
  due_date    date,
  reason      text,
  link        text,
  source_kind text,                           -- notice / graduation / status / calendar / chat
  source_id   bigint,
  severity    int not null default 2,         -- 놓쳤을 때 피해 1~3 (AI가 판단, 실패하면 종류별 기본값)
  priority    int not null default 0,         -- 클수록 위 = 피해 + 마감 가까움 (logic/schedule.py)
  auto_key    text,                           -- 비서가 만든 할 일의 이름표. 다시 계산해도 두 번 안 생기게
  done        boolean not null default false,
  done_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (user_id, auto_key)
);

create table scholarship_applications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references profiles(user_id) on delete cascade,
  notice_id  bigint not null references notices(id) on delete cascade,
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, notice_id)
);

create table briefings (
  id                  bigint generated always as identity primary key,
  user_id             uuid not null references profiles(user_id) on delete cascade,
  date                date not null,
  text                text not null,
  menu_status         jsonb not null default '{}',
  suggested_questions jsonb not null default '[]',
  created_at          timestamptz not null default now(),
  unique (user_id, date)
);

-- ── 챗봇과 알림 ──────────────────────────────────────────
create table conversations (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references profiles(user_id) on delete cascade,
  title      text not null,
  pinned     boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table messages (
  id              bigint generated always as identity primary key,
  conversation_id bigint not null references conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  text            text not null,
  cards           jsonb not null default '[]',
  sources         jsonb not null default '[]',
  actions         jsonb not null default '[]',
  created_at      timestamptz not null default now()
);

create table unanswered_questions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references profiles(user_id) on delete cascade,
  message_id bigint references messages(id) on delete set null,
  question   text not null,
  created_at timestamptz not null default now()
);

create table notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references profiles(user_id) on delete cascade,
  type       text not null check (type in ('notice', 'deadline', 'calendar', 'chat')),
  title      text not null,
  target_id  bigint,
  dedupe_key text not null,                   -- 같은 key가 있으면 다시 안 보냄 (예: 'deadline:31:d-1')
  read       boolean not null default false,
  sent_at    timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

-- 공지 수집 기록 (실패하면 다음 회차에 다시 시도)
create table crawl_logs (
  id         bigint generated always as identity primary key,
  ok         boolean not null,
  new_count  int not null default 0,
  message    text,
  ran_at     timestamptz not null default now()
);

create index on grades (user_id);
create index on timetable (user_id);
create index on todos (user_id, done, due_date);
create index on notifications (user_id, sent_at desc);
create index on messages (conversation_id, id);

-- 앱의 anon 키로는 표를 직접 못 보게 막기 (서버는 DB 비밀번호로 접속해서 영향 없음)
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
