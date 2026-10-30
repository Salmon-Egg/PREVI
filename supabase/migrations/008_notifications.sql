begin;
create table public.notifications (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    user_id uuid not null references auth.users(id) on delete cascade,
    type text not null check (type in ('notice','deadline','calendar','chat')),
    title text not null check (char_length(btrim(title)) between 1 and 200),
    target_id bigint not null check (target_id > 0),
    read boolean not null default false,
    sent_at timestamptz not null default now(),
    event_key text not null default 'once' check (char_length(event_key) between 1 and 100),
    delivery_status text not null default 'reserved' check (delivery_status in ('reserved','in_app','accepted','delivered','failed','unknown')),
    push_ticket_id text,
    push_token_hash text,
    error_code text,
    unique(user_id, type, target_id, event_key)
);
create index notifications_owner_sent on public.notifications(user_id, sent_at desc, id desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select(id,user_id,type,title,target_id,read,sent_at) on public.notifications to authenticated;
grant update(read) on public.notifications to authenticated;
grant all on public.notifications to service_role;
grant usage, select on sequence public.notifications_id_seq to service_role;
create policy notifications_read_own on public.notifications for select to authenticated using ((select auth.uid()) = user_id);
create policy notifications_update_own on public.notifications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 알림 설정·대상·중복 예약을 한 트랜잭션에서 검사. 서버 전용 함수입니다.
create function public.reserve_notification(p_user_id uuid, p_type text, p_title text, p_target_id bigint, p_event_key text default 'once')
returns jsonb language plpgsql set search_path = '' as $$
declare p public.profiles%rowtype; n public.notifications%rowtype; enabled boolean; valid_target boolean := false;
begin
    if p_type not in ('notice','deadline','calendar','chat') or p_type is null or p_target_id <= 0 or p_target_id is null
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
            (cardinality(c.target_grades)=0 or p.grade=any(c.target_grades))) into valid_target;
    end if;
    -- chat은 대화 소유권 표 연결 전까지 발송을 보류합니다.
    if not valid_target then return jsonb_build_object('skipped','target_unavailable'); end if;
    insert into public.notifications(user_id,type,title,target_id,event_key)
        values(p_user_id,p_type,p_title,p_target_id,p_event_key)
        on conflict(user_id,type,target_id,event_key) do nothing returning * into n;
    if not found then return jsonb_build_object('skipped','duplicate'); end if;
    return jsonb_build_object('notification',to_jsonb(n),'push_token',p.push_token);
end;
$$;
revoke execute on function public.reserve_notification(uuid,text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.reserve_notification(uuid,text,text,bigint,text) to service_role;
commit;
select tablename, rowsecurity from pg_tables where schemaname='public' and tablename='notifications';
