-- 공개 공지 원문·AI 처리 대기, 개인별 판정, 할 일과 신청 기록.
begin;
create table public.notices (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    board_post_id text not null unique,
    title text not null,
    body text not null,
    url text not null unique,
    posted_at timestamptz not null,
    category text not null,
    summary jsonb not null default '[]' check (jsonb_typeof(summary) = 'array'),
    deadline timestamptz,
    documents jsonb not null default '[]' check (jsonb_typeof(documents) = 'array'),
    target jsonb not null default '{}' check (jsonb_typeof(target) = 'object'),
    conditions jsonb not null default '{}' check (jsonb_typeof(conditions) = 'object'),
    attachments jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array'),
    extraction_status text not null default 'pending' check (extraction_status in ('pending','ready','failed'))
);
create table public.eligibility (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    user_id uuid not null references auth.users(id) on delete cascade,
    notice_id bigint not null references public.notices(id) on delete cascade,
    verdict text not null check (verdict in ('eligible','ineligible','check')),
    reasons jsonb not null default '[]' check (jsonb_typeof(reasons) = 'array'),
    unique(user_id, notice_id)
);
create table public.todos (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    type text not null check (type in ('deadline','scholarship','graduation','status')),
    title text not null check (char_length(btrim(title)) between 1 and 200),
    due_date date,
    reason text not null default '사용자가 직접 등록한 할 일이에요.',
    link text,
    source_kind text check (source_kind is null or source_kind = 'notice'),
    source_id bigint references public.notices(id) on delete cascade,
    priority integer not null default 0,
    done boolean not null default false,
    done_at timestamptz,
    check ((source_kind is null and source_id is null) or (source_kind is not null and source_kind = 'notice' and source_id is not null)),
    check ((done and done_at is not null) or (not done and done_at is null)),
    unique(user_id, source_kind, source_id)
);
create index todos_owner_due on public.todos(user_id, due_date, id);
create table public.scholarship_applications (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    user_id uuid not null references auth.users(id) on delete cascade,
    notice_id bigint not null references public.notices(id) on delete cascade,
    applied_at timestamptz not null default now(),
    unique(user_id, notice_id)
);

alter table public.notices enable row level security;
alter table public.eligibility enable row level security;
alter table public.todos enable row level security;
alter table public.scholarship_applications enable row level security;
revoke all on public.notices, public.eligibility, public.todos, public.scholarship_applications from public, anon, authenticated;
grant select on public.notices, public.eligibility, public.todos, public.scholarship_applications to authenticated;
grant insert on public.todos to authenticated;
grant update(done) on public.todos to authenticated;
grant usage on sequence public.todos_id_seq to authenticated;
grant all on public.notices, public.eligibility, public.todos, public.scholarship_applications to service_role;
grant usage, select on sequence public.notices_id_seq, public.eligibility_id_seq, public.todos_id_seq, public.scholarship_applications_id_seq to service_role;
create policy notices_public_read on public.notices for select to authenticated using (true);
create policy eligibility_read_own on public.eligibility for select to authenticated using ((select auth.uid()) = user_id);
create policy todos_read_own on public.todos for select to authenticated using ((select auth.uid()) = user_id);
create policy todos_insert_own on public.todos for insert to authenticated with check ((select auth.uid()) = user_id);
create policy todos_update_own on public.todos for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy applications_read_own on public.scholarship_applications for select to authenticated using ((select auth.uid()) = user_id);

-- 상태 시각을 DB가 관리하고, 신청 기록과 완료 상태를 한 트랜잭션에서 맞춥니다.
create function public.stamp_todo() returns trigger language plpgsql set search_path = '' as $$
begin
    if new.type = 'scholarship' and (new.source_id is null or not exists(select 1 from public.notices where id = new.source_id and category = '장학')) then
        raise exception using message = 'INVALID_SCHOLARSHIP_SOURCE';
    end if;
    if new.done then
        if tg_op = 'UPDATE' and old.done then new.done_at := old.done_at;
        else new.done_at := now(); end if;
    else new.done_at := null; end if;
    return new;
end;
$$;
revoke execute on function public.stamp_todo() from public, anon, authenticated;
create trigger todos_stamp before insert or update on public.todos for each row execute function public.stamp_todo();

-- 사용자 입력의 ID를 직접 쓰지 않고, 트리거가 받은 본인 할 일 행만으로 기록합니다.
create function public.sync_todo_application() returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if new.type = 'scholarship' and new.source_kind = 'notice' then
        if new.done then
            insert into public.scholarship_applications(user_id, notice_id, applied_at)
            values(new.user_id, new.source_id, new.done_at) on conflict(user_id, notice_id) do nothing;
        elsif tg_op = 'UPDATE' and old.done then
            delete from public.scholarship_applications where user_id = new.user_id and notice_id = new.source_id;
        end if;
    end if;
    return new;
end;
$$;
revoke execute on function public.sync_todo_application() from public, anon, authenticated;
create trigger todos_sync_application after insert or update on public.todos for each row execute function public.sync_todo_application();
commit;
select tablename, rowsecurity from pg_tables where schemaname='public'
and tablename in ('notices','eligibility','todos','scholarship_applications') order by tablename;
