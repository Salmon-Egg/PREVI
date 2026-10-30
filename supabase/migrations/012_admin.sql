-- 관리자 웹: 못한 질문 처리 상태·원인, 답변 평가(👍👎).
-- 관리자 읽기·쓰기는 서버(서버 전용 키 + ADMIN_EMAILS 확인)로만. 학생 권한은 자기 메시지 평가만 추가.
begin;
alter table public.unanswered_questions
    add column status text not null default 'open' check (status in ('open','done')),
    add column cause text check (cause in ('no_document','outdated','ambiguous','notice_missing')),
    add column resolved_at timestamptz;
create index unanswered_status on public.unanswered_questions(status, created_at desc);

alter table public.messages add column feedback text check (feedback in ('up','down'));
-- messages_own 정책(for all)이 자기 대화만 허용하므로 칸 권한만 추가
grant update(feedback) on public.messages to authenticated;
commit;
