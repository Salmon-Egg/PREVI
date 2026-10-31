-- 고객센터: 학생이 관리자에게 보내는 문의. 학생은 자기 글을 보고 쓰기만, 답변은 서버(서버 전용 키 + ADMIN_EMAILS 확인)로만.
-- answer가 비어 있으면 답변 대기. 답변 알림 종류 'support'도 추가 (알림 설정은 '답변 도착'을 따름).
begin;
create table public.support_tickets (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    category text not null check (category in ('앱 오류','계정','기타')),
    title text not null check (char_length(btrim(title)) between 1 and 100),
    body text not null check (char_length(btrim(body)) between 1 and 2000),
    answer text check (answer is null or char_length(btrim(answer)) between 1 and 2000),
    answered_at timestamptz
);
create index support_tickets_owner on public.support_tickets(user_id, id desc);
create index support_tickets_waiting on public.support_tickets(id desc) where answer is null;

alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from public, anon, authenticated;
grant select on public.support_tickets to authenticated;
grant insert(category, title, body) on public.support_tickets to authenticated;
grant all on public.support_tickets to service_role;
create policy support_tickets_read_own on public.support_tickets for select to authenticated using ((select auth.uid()) = user_id);
create policy support_tickets_insert_own on public.support_tickets for insert to authenticated with check ((select auth.uid()) = user_id);

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in ('notice','deadline','calendar','chat','support'));

-- 011 함수에 'support'만 추가. 설정 칸은 case의 else(notify_chat)를 그대로 씀
create or replace function public.reserve_notification(p_user_id uuid, p_type text, p_title text, p_target_id bigint, p_event_key text default 'once')
returns jsonb language plpgsql set search_path = '' as $$
declare p public.profiles%rowtype; reserved_row public.notifications%rowtype; enabled boolean; valid_target boolean := false;
begin
    if p_type not in ('notice','deadline','calendar','chat','support') or p_type is null or p_target_id <= 0 or p_target_id is null
        or p_title is null or char_length(btrim(p_title)) not between 1 and 200
        or p_event_key is null or char_length(p_event_key) not between 1 and 100 then
        raise exception 'INVALID_NOTIFICATION';
    end if;
    select * into p from public.profiles where user_id=p_user_id for update;
    if not found then return jsonb_build_object('skipped','profile_missing'); end if;
    enabled := case p_type when 'notice' then p.notify_notice when 'deadline' then p.notify_deadline when 'calendar' then p.notify_calendar else p.notify_chat end;
    if not enabled or p.consent_agreed_at is null then return jsonb_build_object('skipped','disabled'); end if;
    if p_type='notice' then
        select exists(select 1 from public.notices n join public.eligibility e on e.notice_id=n.id
            where n.id=p_target_id and e.user_id=p_user_id and e.verdict in ('eligible','check')) into valid_target;
    elsif p_type='deadline' then
        select exists(select 1 from public.todos t where t.id=p_target_id and t.user_id=p_user_id and not t.done and t.due_date is not null) into valid_target;
    elsif p_type='calendar' then
        select exists(select 1 from public.academic_calendar c where c.id=p_target_id and
            (c.target_grades is null or cardinality(c.target_grades)=0 or p.grade=any(c.target_grades))) into valid_target;
    elsif p_type='support' then
        select exists(select 1 from public.support_tickets s where s.id=p_target_id and s.user_id=p_user_id and s.answer is not null) into valid_target;
    end if;
    -- chat은 대화 소유권 표 연결 전까지 발송을 보류합니다.
    if not valid_target then return jsonb_build_object('skipped','target_unavailable'); end if;
    insert into public.notifications(user_id,type,title,target_id,event_key)
        values(p_user_id,p_type,p_title,p_target_id,p_event_key)
        on conflict(user_id,type,target_id,event_key) do nothing returning * into reserved_row;
    if not found then return jsonb_build_object('skipped','duplicate'); end if;
    return jsonb_build_object('notification',to_jsonb(reserved_row),'push_token',p.push_token);
end;
$$;
revoke execute on function public.reserve_notification(uuid,text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.reserve_notification(uuid,text,text,bigint,text) to service_role;
commit;
