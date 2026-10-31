-- 과목을 개설 년도·학기로 나눔. 학생 검색은 가장 최근 정규 학기만 봄.
begin;

alter table public.courses
    add column term text check (term ~ '^[0-9]{4}-(1|2|여름|겨울)$');  -- '2026-2'. 비면 '학기 미지정'
create index courses_term on public.courses(term);

-- 처음 올린 1,252개는 '2026-2학기 강의시간표_20260826v2.hwp'와 전부 일치함을 확인함. 나머지는 어느 파일인지 몰라 미지정으로 둠
update public.courses set term = '2026-2' where id between 3 and 1254;

commit;
