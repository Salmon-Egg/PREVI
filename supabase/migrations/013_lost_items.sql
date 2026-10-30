-- 분실물(습득물) 게시판. 주운 학생이 글을 올리고, 주인은 습득자가 정한 질문에 맞게 답해야 보관 장소를 봄.
-- 답(answer)·보관 장소(storage_place)는 칸 권한으로 막고 lost_item_place 함수로만 꺼냄. 사진은 Storage 'lost-items'.
begin;
create table public.lost_items (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    title text not null check (char_length(btrim(title)) between 1 and 100),
    category text not null check (category in ('전자기기','지갑·카드','가방','의류','책·문구','기타')),
    place text not null check (char_length(btrim(place)) between 1 and 100),
    found_on date not null,
    description text not null default '' check (char_length(description) <= 1000),
    image_path text check (image_path is null or char_length(image_path) <= 200),
    question text not null check (char_length(btrim(question)) between 1 and 100),
    answer text not null check (char_length(btrim(answer)) between 1 and 50),
    storage_place text not null check (char_length(btrim(storage_place)) between 1 and 100),
    status text not null default 'open' check (status in ('open','closed'))
);
create index lost_items_open on public.lost_items(status, id desc);
-- 학생별 답 시도 횟수 (3번까지). 함수만 씀
create table public.lost_item_tries (
    item_id bigint not null references public.lost_items(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    tries integer not null default 0,
    solved boolean not null default false,
    primary key(item_id, user_id)
);

alter table public.lost_items enable row level security;
alter table public.lost_item_tries enable row level security;
revoke all on public.lost_items, public.lost_item_tries from public, anon, authenticated;
grant select(id, created_at, user_id, title, category, place, found_on, description, image_path, question, status) on public.lost_items to authenticated;
grant insert(title, category, place, found_on, description, image_path, question, answer, storage_place) on public.lost_items to authenticated;
grant update(status) on public.lost_items to authenticated;
grant delete on public.lost_items to authenticated;
grant all on public.lost_items, public.lost_item_tries to service_role;
create policy lost_items_read on public.lost_items for select to authenticated using (true);
create policy lost_items_insert_own on public.lost_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy lost_items_update_own on public.lost_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy lost_items_delete_own on public.lost_items for delete to authenticated using ((select auth.uid()) = user_id);

-- 보관 장소 꺼내기: 글쓴이·이미 맞힌 학생은 바로, 아니면 p_answer가 맞을 때만. 답이 없으면 시도로 안 셈.
-- 띄어쓰기·대소문자는 무시하고 비교. 3번 틀리면 더 못 함. 글이 없으면 빈 결과.
create function public.lost_item_place(p_item bigint, p_answer text default null)
returns table(storage_place text, tries_left integer) language plpgsql security definer set search_path = '' as $$
declare
    item public.lost_items;
    t public.lost_item_tries;
    me uuid := auth.uid();
    n integer;
begin
    select * into item from public.lost_items where id = p_item;
    if not found or me is null then return; end if;
    select * into t from public.lost_item_tries where item_id = p_item and user_id = me;
    if item.user_id = me or coalesce(t.solved, false) then
        return query select item.storage_place, 3; return;
    end if;
    n := coalesce(t.tries, 0);
    if p_answer is not null and n < 3 then
        -- 먼저 횟수를 올리고 비교 → 동시에 여러 번 보내도 3번을 넘지 않음
        insert into public.lost_item_tries(item_id, user_id, tries) values (p_item, me, 1)
        on conflict (item_id, user_id) do update set tries = public.lost_item_tries.tries + 1
        returning tries into n;
        if n <= 3 and lower(regexp_replace(p_answer, '\s', '', 'g')) = lower(regexp_replace(item.answer, '\s', '', 'g')) then
            update public.lost_item_tries set solved = true where item_id = p_item and user_id = me;
            return query select item.storage_place, 3; return;
        end if;
    end if;
    return query select null::text, greatest(0, 3 - n);
end;
$$;
revoke execute on function public.lost_item_place(bigint, text) from public, anon;
grant execute on function public.lost_item_place(bigint, text) to authenticated;

-- 사진: 누구나 주소로 보기(public), 올리기·지우기는 자기 폴더({user_id}/...)만. 5MB, jpg·png·webp
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lost-items', 'lost-items', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy lost_items_photo_read_own on storage.objects for select to authenticated
    using (bucket_id = 'lost-items' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy lost_items_photo_upload_own on storage.objects for insert to authenticated
    with check (bucket_id = 'lost-items' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy lost_items_photo_delete_own on storage.objects for delete to authenticated
    using (bucket_id = 'lost-items' and (storage.foldername(name))[1] = (select auth.uid())::text);
commit;
