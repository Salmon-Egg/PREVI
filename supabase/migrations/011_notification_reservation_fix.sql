-- 008 알림 예약의 행 변수 n과 SQL 별칭 n 충돌 수정. 기존 표와 데이터는 유지합니다.
begin;
create or replace function public.reserve_notification(p_user_id uuid, p_type text, p_title text, p_target_id bigint, p_event_key text default 'once')
returns jsonb language plpgsql set search_path = '' as $$
declare p public.profiles%rowtype; reserved_row public.notifications%rowtype; enabled boolean; valid_target boolean := false;
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
            (c.target_grades is null or cardinality(c.target_grades)=0 or p.grade=any(c.target_grades))) into valid_target;
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
