-- 초기 자료: 2026 공식 요람의 학사일정. 추후 교무처 변경 공지를 확인해 갱신합니다.
-- https://www.skuniv.ac.kr/wp-content/uploads/2026/04/48589058-f7a3-429b-a64f-9288e740ac34.pdf (PDF 4쪽)
begin;
create table public.academic_calendar (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    title text not null check (char_length(btrim(title)) between 1 and 200),
    start_date date not null,
    end_date date not null,
    target_grades integer[] not null default '{}',
    source_url text not null,
    check (end_date >= start_date),
    check (target_grades <@ array[1,2,3,4,5,6]),
    unique(title, start_date, end_date)
);
alter table public.academic_calendar enable row level security;
revoke all on public.academic_calendar from public, anon, authenticated;
grant select on public.academic_calendar to authenticated;
grant all on public.academic_calendar to service_role;
grant usage, select on sequence public.academic_calendar_id_seq to service_role;
create policy academic_calendar_read on public.academic_calendar for select to authenticated using (true);

insert into public.academic_calendar(title, start_date, end_date, target_grades, source_url)
select title, start_date::date, end_date::date, '{}'::integer[],
    'https://www.skuniv.ac.kr/wp-content/uploads/2026/04/48589058-f7a3-429b-a64f-9288e740ac34.pdf#page=4'
from (values
    ('2학기 수업일수 3/4선', '2026-11-24', '2026-11-24'),
    ('2학기 기말시험(일반 일정·무전공전형 별도)', '2026-12-08', '2026-12-14'),
    ('동계방학 시작', '2026-12-16', '2026-12-16'),
    ('동계계절학기', '2026-12-17', '2027-01-08'),
    ('2학기 성적열람 및 정정', '2026-12-22', '2026-12-31'),
    ('2학기 성적발표', '2027-01-04', '2027-01-04'),
    ('1학기 휴학·복학·재입학·전과 신청', '2027-01-18', '2027-01-29'),
    ('1학기 수강신청', '2027-02-15', '2027-02-17')
) as initial(title, start_date, end_date);
commit;
select title, start_date, end_date from public.academic_calendar order by start_date, id;
