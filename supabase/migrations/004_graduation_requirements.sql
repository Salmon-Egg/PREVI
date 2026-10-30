-- 조사 근거: supabase/research/졸업요건_공식자료_조사.md
-- 이 표는 확인된 최소 학점과 필수과목 점검용이며 최종 졸업사정 결과가 아닙니다.
begin;
create table public.grad_requirements (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    department text not null,
    admission_year integer not null check (admission_year between 1900 and 2100),
    total_credits numeric(5,1) not null check (total_credits > 0),
    areas jsonb not null check (jsonb_typeof(areas) = 'array'),
    required_courses jsonb not null check (jsonb_typeof(required_courses) = 'array'),
    certifications jsonb not null default '[]' check (jsonb_typeof(certifications) = 'array'),
    unique (department, admission_year)
);
alter table public.grad_requirements enable row level security;
revoke all on public.grad_requirements from public, anon, authenticated;
grant select on public.grad_requirements to authenticated;
grant all on public.grad_requirements to service_role;
grant usage, select on sequence public.grad_requirements_id_seq to service_role;
create policy graduation_rules_read on public.grad_requirements for select to authenticated using (true);

-- 2024 요람의 구 소프트웨어학과 기준과 현재 공통 교양 안내를 대조.
insert into public.grad_requirements (department, admission_year, total_credits, areas, required_courses, certifications)
select '소프트웨어학과', year, 120,
    '[{"name":"전공","required":48},{"name":"교양","required":33}]'::jsonb,
    '[{"name":"운영체제"},{"name":"알고리즘및실습"},{"name":"소프트웨어공학"},{"name":"캡스톤설계1"},{"name":"캡스톤설계2"}]'::jsonb ||
        case when year >= 2023 then '[{"name":"데이터베이스"}]'::jsonb
        else '[{"name":"프로그래밍기초 또는 데이터베이스 대체 인정 확인","manual":true}]'::jsonb end,
    '["졸업작품및시험(CS1999) P 및 작품 심사 결과 확인","1·2학년 내규상 필수과목 전체 확인","4학년 내규상 최소 전공학점 확인","교양 필수 교과목과 선택 영역별 이수 확인","편입·학과 변경·재수강·학점포기 등 개인별 예외 확인"]'::jsonb
from generate_series(2021, 2024) as years(year);

-- 현재 전자컴퓨터공학과 안내: 2023학번 이후 핵심 및 설계 과목.
insert into public.grad_requirements (department, admission_year, total_credits, areas, required_courses, certifications)
select '전자컴퓨터공학과', year, 120,
    '[{"name":"전공","required":48},{"name":"교양","required":33}]'::jsonb,
    '[{"name":"C프로그래밍"},{"name":"논리회로"},{"name":"컴퓨터구조"},{"name":"인공지능기초"},{"name":"공학종합설계1"},{"name":"공학종합설계2"}]'::jsonb,
    '["졸업논문및시험(EN1066) P 확인","졸업작품 심사·작품전 참가·논문 제출 확인","1학년 1·2학기 및 2학년 1학기 전체 전공 이수 확인","전자컴퓨터공학개론의 인공지능기초 대체 인정 확인","교양 필수 교과목과 선택 영역별 이수 확인","편입·학과 변경·재수강·학점포기 등 개인별 예외 확인"]'::jsonb
from generate_series(2023, 2024) as years(year);

-- 2022학번 이전 전컴공은 통합 전 학과를 알아야 하므로 일괄 등록하지 않습니다.
-- 2025학번 이후 개편 전공도 별도 교육과정 확인 전까지 등록하지 않습니다.
-- 현재 폐지된 영어 졸업요건과 CREOS·SKON·DREAM 인증은 넣지 않습니다.
commit;
select department, admission_year, total_credits from public.grad_requirements order by department, admission_year;
