-- Supabase SQL Editor에서 이 파일 전체를 실행합니다.
-- 기존 표를 덮어쓰지 않습니다. 실행 실패 시 오류를 확인하세요.
begin;

create table public.profiles (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    user_id uuid not null unique default auth.uid() references auth.users(id) on delete cascade,
    nickname text check (char_length(nickname) between 1 and 40),
    department text check (char_length(department) between 1 and 100),
    minor text check (char_length(minor) between 1 and 100),
    grade integer check (grade between 1 and 6),
    semester integer check (semester between 1 and 2),
    status text not null default 'enrolled' check (status in ('enrolled', 'leave', 'returned')),
    admission_year integer check (admission_year between 1900 and 2100),
    interests text[] not null default '{}',
    consent_agreed_at timestamptz,
    notify_notice boolean not null default false,
    notify_deadline boolean not null default false,
    notify_calendar boolean not null default false,
    notify_chat boolean not null default false,
    notify_time time not null default '09:00',
    push_token text
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant usage on sequence public.profiles_id_seq to authenticated;
grant all on public.profiles to service_role;
grant usage, select on sequence public.profiles_id_seq to service_role;

create policy profiles_select_own on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);
create policy profiles_insert_own on public.profiles for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy profiles_update_own on public.profiles for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

commit;

-- 성공 여부와 RLS 활성화를 확인합니다.
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename = 'profiles';
