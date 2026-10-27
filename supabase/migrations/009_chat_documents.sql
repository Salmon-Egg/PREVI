-- 챗봇(BE B): 문서 검색(학사요람·규정), 대화·메시지, '모른다' 질문 기록.
-- 문서는 서버 키(load_yoram)로만 넣고, 로그인 학생은 읽기만. 대화는 자기 것만.
begin;
create extension if not exists vector;

create table public.documents (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    title text not null,
    url text,
    kind text not null                                   -- 학사요람 / 규정
);
-- 768 = embeddinggemma:300m. 모델을 바꾸면 숫자도 바꿔야 함
create table public.doc_chunks (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    document_id bigint not null references public.documents(id) on delete cascade,
    content text not null,
    embedding vector(768)                                -- 가짜 AI 모드에선 비어 있고 글자 검색으로 대신함
);
create table public.conversations (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    title text not null check (char_length(title) between 1 and 100),
    pinned boolean not null default false,
    updated_at timestamptz not null default now()
);
create table public.messages (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    conversation_id bigint not null references public.conversations(id) on delete cascade,
    role text not null check (role in ('user','assistant')),
    text text not null,
    cards jsonb not null default '[]',
    sources jsonb not null default '[]',
    actions jsonb not null default '[]'
);
create index messages_conv on public.messages(conversation_id, id);
create table public.unanswered_questions (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    message_id bigint references public.messages(id) on delete set null,
    question text not null
);

alter table public.documents enable row level security;
alter table public.doc_chunks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.unanswered_questions enable row level security;

grant select on public.documents, public.doc_chunks to authenticated;
grant all on public.documents, public.doc_chunks to service_role;
grant usage, select on sequence public.documents_id_seq, public.doc_chunks_id_seq to service_role;
create policy documents_read on public.documents for select to authenticated using (true);
create policy doc_chunks_read on public.doc_chunks for select to authenticated using (true);

grant select, insert, update(pinned, updated_at) on public.conversations to authenticated;
grant usage, select on sequence public.conversations_id_seq to authenticated;
create policy conversations_own on public.conversations for all to authenticated
    using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert on public.messages to authenticated;
grant usage, select on sequence public.messages_id_seq to authenticated;
create policy messages_own on public.messages for all to authenticated
    using (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())))
    with check (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));

-- 학생은 기록만, 읽기는 관리자 기능(추후)에서
grant insert on public.unanswered_questions to authenticated;
grant usage, select on sequence public.unanswered_questions_id_seq to authenticated;
create policy unanswered_insert_own on public.unanswered_questions for insert to authenticated
    with check ((select auth.uid()) = user_id);

-- 벡터 검색: 질문 벡터와 가까운 문단 k개 (REST: POST /rest/v1/rpc/match_doc_chunks)
create function public.match_doc_chunks(query_embedding vector(768), match_count int default 3)
returns table (content text, title text, url text, distance float)
language sql stable set search_path = public, extensions as $$
    select c.content, d.title, d.url, c.embedding <=> query_embedding as distance
    from public.doc_chunks c join public.documents d on d.id = c.document_id
    where c.embedding is not null
    order by distance limit match_count;
$$;
grant execute on function public.match_doc_chunks(vector, int) to authenticated;
commit;
