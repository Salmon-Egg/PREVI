-- 입력 정보 기반 시간표 계획용. 학교의 실제 수강신청을 수행하지 않습니다.
-- 출처: https://www.skuniv.ac.kr/notice/65877
-- 기본 19/20학점, 직전학기 평점 4.35 이상 +3. 학사경고 추정은 15학점.
begin;

create function public.valid_class_times(slots jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare a jsonb; b jsonb; i integer; j integer;
begin
    if slots is null or jsonb_typeof(slots) <> 'array' then return false; end if;
    if jsonb_array_length(slots) < 1 or jsonb_array_length(slots) > 21 then return false; end if;
    for i in 0..jsonb_array_length(slots)-1 loop
        a := slots -> i;
        if jsonb_typeof(a) <> 'object' or
           coalesce(a ->> 'day', '') not in ('월','화','수','목','금','토','일') or
           coalesce(a ->> 'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or
           coalesce(a ->> 'end', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or
           (a ->> 'start') >= (a ->> 'end') then return false; end if;
        for j in 0..i-1 loop
            b := slots -> j;
            if a ->> 'day' = b ->> 'day' and a ->> 'start' < b ->> 'end' and b ->> 'start' < a ->> 'end' then return false; end if;
        end loop;
    end loop;
    return true;
end;
$$;

create table public.timetable (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    course_id bigint references public.courses(id) on delete set null,
    term text not null check (term ~ '^[1-6]-[12]$'),
    course_name text not null check (char_length(btrim(course_name)) between 1 and 200),
    credits numeric(4,1) not null check (credits > 0),
    times jsonb not null check (public.valid_class_times(times))
);
create index timetable_owner_term on public.timetable(user_id, term);
alter table public.timetable enable row level security;
revoke all on public.timetable from public, anon, authenticated;
grant select, insert, delete on public.timetable to authenticated;
grant usage on sequence public.timetable_id_seq to authenticated;
grant all on public.timetable to service_role;
grant usage, select on sequence public.timetable_id_seq to service_role;
create policy timetable_read_own on public.timetable for select to authenticated using ((select auth.uid()) = user_id);
create policy timetable_insert_own on public.timetable for insert to authenticated with check ((select auth.uid()) = user_id);
create policy timetable_delete_own on public.timetable for delete to authenticated using ((select auth.uid()) = user_id);

create function public.check_timetable_insert() returns trigger
language plpgsql set search_path = '' as $$
declare
    p public.profiles%rowtype;
    c public.courses%rowtype;
    required numeric;
    max_credits numeric;
    previous_term text;
    previous_gpa numeric;
begin
    -- 같은 사용자의 추가를 순서대로 처리해 첫 등록부터 동시 요청 우회를 막습니다.
    select * into p from public.profiles where user_id = new.user_id for update;
    if not found or p.grade is null or p.semester is null or p.department is null or p.admission_year is null then
        raise exception using message = 'PROFILE_INCOMPLETE';
    end if;
    new.term := p.grade::text || '-' || p.semester::text;
    if new.course_id is not null then
        select * into c from public.courses where id = new.course_id;
        if not found then raise exception using message = 'COURSE_NOT_FOUND'; end if;
        new.course_name := c.name; new.credits := c.credits; new.times := c.times;
    end if;
    if not public.valid_class_times(new.times) then raise exception using message = 'INVALID_TIMES'; end if;
    if exists(select 1 from public.timetable t where t.user_id = new.user_id and t.term = new.term
        and (lower(regexp_replace(t.course_name, '\s+', '', 'g')) = lower(regexp_replace(new.course_name, '\s+', '', 'g'))
             or (new.course_id is not null and t.course_id = new.course_id))) then
        raise exception using message = 'DUPLICATE_COURSE';
    end if;
    if exists(select 1 from public.timetable t, jsonb_array_elements(t.times) oldslot, jsonb_array_elements(new.times) newslot
        where t.user_id = new.user_id and t.term = new.term
        and oldslot ->> 'day' = newslot ->> 'day'
        and oldslot ->> 'start' < newslot ->> 'end' and newslot ->> 'start' < oldslot ->> 'end') then
        raise exception using message = 'TIME_CONFLICT';
    end if;
    select total_credits into required from public.grad_requirements where department = p.department and admission_year = p.admission_year;
    if required = 120 then max_credits := 19;
    elsif required = 130 then max_credits := 20;
    else raise exception using message = 'CREDIT_RULES_UNKNOWN'; end if;
    previous_term := case when p.semester = 2 then p.grade::text || '-1'
        when p.grade > 1 then (p.grade-1)::text || '-2' else null end;
    select trunc(sum(credits * case grade when 'A+' then 4.5 when 'A0' then 4 when 'B+' then 3.5 when 'B0' then 3
        when 'C+' then 2.5 when 'C0' then 2 when 'D+' then 1.5 when 'D0' then 1 else 0 end) / nullif(sum(credits), 0), 2)
        into previous_gpa from public.grades where user_id = new.user_id and term = previous_term and grade <> 'P';
    if previous_gpa < 1.6 then max_credits := 15;
    elsif previous_gpa >= 4.35 then max_credits := max_credits + 3; end if;
    if new.credits + coalesce((select sum(credits) from public.timetable where user_id = new.user_id and term = new.term), 0) > max_credits then
        raise exception using message = 'CREDIT_LIMIT';
    end if;
    return new;
end;
$$;
revoke execute on function public.check_timetable_insert() from public, anon, authenticated;
create trigger timetable_validate before insert on public.timetable for each row execute function public.check_timetable_insert();

-- 함수의 입력 검사를 수행합니다. 사용자나 시간표 데이터는 만들지 않습니다.
do $$
begin
    if not public.valid_class_times('[{"day":"월","start":"09:00","end":"10:00"},{"day":"월","start":"10:00","end":"11:00"}]') then raise exception 'adjacent class check failed'; end if;
    if public.valid_class_times('[{"day":"월","start":"09:00","end":"10:00"},{"day":"월","start":"09:30","end":"11:00"}]') then raise exception 'overlap check failed'; end if;
    if public.valid_class_times('[]') or public.valid_class_times('[{"day":"월","start":"12:00","end":"09:00"}]') then raise exception 'invalid times check failed'; end if;
end;
$$;
commit;
select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'timetable';
