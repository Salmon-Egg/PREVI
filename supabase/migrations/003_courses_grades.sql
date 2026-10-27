-- 과목 목록과 학생 직접 입력 성적. 졸업 기준·과목 시드는 별도로 확인 후 넣습니다.
begin;

create table public.courses (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    name text not null check (char_length(btrim(name)) between 1 and 200),
    credits numeric(4,1) not null check (credits > 0),
    area text not null check (char_length(btrim(area)) between 1 and 100),
    times jsonb not null default '[]'::jsonb check (jsonb_typeof(times) = 'array')
);

create table public.grades (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    term text not null check (term ~ '^[1-6]-[12]$'),
    course_name text not null check (char_length(btrim(course_name)) between 1 and 200),
    credits numeric(4,1) not null check (credits > 0),
    grade text not null check (grade in ('A+', 'A0', 'B+', 'B0', 'C+', 'C0', 'D+', 'D0', 'F', 'P')),
    area text not null check (char_length(btrim(area)) between 1 and 100),
    unique (user_id, term, course_name)
);

alter table public.courses enable row level security;
alter table public.grades enable row level security;
revoke all on public.courses, public.grades from public, anon, authenticated;
grant select on public.courses to authenticated;
grant select, insert, update, delete on public.grades to authenticated;
grant usage on sequence public.grades_id_seq to authenticated;
grant all on public.courses, public.grades to service_role;
grant usage, select on sequence public.courses_id_seq, public.grades_id_seq to service_role;

create policy courses_read on public.courses for select to authenticated using (true);
create policy grades_read_own on public.grades for select to authenticated
using ((select auth.uid()) = user_id);
create policy grades_insert_own on public.grades for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy grades_update_own on public.grades for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy grades_delete_own on public.grades for delete to authenticated
using ((select auth.uid()) = user_id);

commit;
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('courses', 'grades') order by tablename;
