-- seed.sql : 시연용 데이터. 001_init.sql 다음에 실행합니다.
-- ※ 졸업 기준·학사요람 문장·과목 시간은 화면을 만들기 위한 "예시 값"입니다.
--    실제 서경대 학사요람을 받으면 이 파일의 값을 바꿔야 합니다.
-- 날짜는 current_date 기준으로 넣어서, 언제 실행해도 D-day가 살아 있습니다.

-- ── 졸업 기준 (2개 학과, 예시 값) ─────────────────────────
insert into grad_requirements (department, admission_year, total_credits, areas, required_courses, certifications) values
('소프트웨어학과', null, 130,
 '[{"name":"전공","required":66},{"name":"교양 필수","required":18},{"name":"교양 선택","required":20}]',
 '["캡스톤디자인I","캡스톤디자인II"]',
 '["졸업 영어 인증","졸업작품 심사 신청"]'),
('전자컴퓨터공학과', null, 130,
 '[{"name":"전공","required":63},{"name":"교양 필수","required":18},{"name":"교양 선택","required":20}]',
 '["종합설계"]',
 '["졸업 영어 인증","졸업 논문 제출"]');

-- ── 과목 목록 (예시) ─────────────────────────────────────
-- 시간은 교시 단위 (01교시 = 09:00~10:00, 02교시 = 10:00~11:00 …). 앱이 "월 02,03"처럼 교시로 보여 줌
insert into courses (name, code, credits, area, category, professor, room, department, times) values
('캡스톤디자인II',   'CS0401', 3, '전공', '전필', '김서경', '북304',   '소프트웨어학과', '[{"day":"월","start":"10:00","end":"12:00"},{"day":"수","start":"09:00","end":"10:00"}]'),
('인공지능개론',     'CS0312', 3, '전공', '전선', '이박사', '유담102', '소프트웨어학과', '[{"day":"화","start":"12:00","end":"14:00"},{"day":"목","start":"12:00","end":"13:00"}]'),
('빅데이터분석',     'CS0355', 3, '전공', '전선', '박데이터', '정보301', '소프트웨어학과', '[{"day":"수","start":"13:00","end":"16:00"}]'),
('금융빅데이터응용', 'CS0388', 3, '전공', '전선', '이금융', '정보202', '소프트웨어학과', '[{"day":"화","start":"10:00","end":"12:00"}]'),
('웹프로그래밍',     'CS0341', 3, '전공', '전선', '이이철', '정보201', '소프트웨어학과', '[{"day":"목","start":"14:00","end":"17:00"}]'),
('소프트웨어공학',   'CS0321', 3, '전공', '전필', '정공학', '정보204', '소프트웨어학과', '[{"day":"월","start":"13:00","end":"15:00"}]'),
('데이터베이스',     'CS0322', 3, '전공', '전선', '최디비', '정보203', '소프트웨어학과', '[{"day":"화","start":"15:00","end":"17:00"}]'),
('자료구조',         'CS0211', 3, '전공', '전필', '김자료', '정보205', '소프트웨어학과', '[{"day":"월","start":"15:00","end":"17:00"}]'),
('운영체제',         'EC0331', 3, '전공', '전선', '박운영', '미래301', '전자컴퓨터공학과', '[{"day":"화","start":"15:00","end":"17:00"}]'),
('컴퓨터네트워크',   'EC0342', 3, '전공', '전선', '정네트', '미래302', '전자컴퓨터공학과', '[{"day":"수","start":"16:00","end":"18:00"}]'),
('회로이론',         'EC0201', 3, '전공', '전필', '한회로', '미래201', '전자컴퓨터공학과', '[{"day":"월","start":"14:00","end":"17:00"}]'),
('디지털논리회로',   'EC0212', 3, '전공', '전필', '오논리', '미래202', '전자컴퓨터공학과', '[{"day":"금","start":"09:00","end":"12:00"}]'),
('임베디드시스템',   'EC0412', 3, '전공', '전선', '강임베', '미래401', '전자컴퓨터공학과', '[{"day":"목","start":"15:00","end":"18:00"}]'),
('빅데이터개론',     'GE0302', 2, '교양 선택', '교양', '정정보', '청운201', null, '[{"day":"목","start":"09:00","end":"11:00"}]'),
('모바일앱디자인',   'DS0201', 3, '교양 선택', '일선', '최디자인', '예지301', null, '[{"day":"금","start":"10:00","end":"13:00"}]'),
('서경인성리더십',   'GE0101', 1, '교양 필수', '교양', '서경인', '청운홀',  null, '[{"day":"금","start":"12:00","end":"13:00"}]'),
('대학영어',         'GE0110', 2, '교양 필수', '교양', '영어팀', '청운101', null, '[{"day":"화","start":"16:00","end":"18:00"}]'),
('글쓰기와의사소통', 'GE0120', 2, '교양 필수', '교양', '국어팀', '청운102', null, '[{"day":"목","start":"11:00","end":"13:00"}]'),
('경영학원론',       'BA0101', 3, '교양 선택', '일선', '경영팀', '경영201', null, '[{"day":"금","start":"14:00","end":"17:00"}]');

-- ── 학사일정 (오늘 기준) ──────────────────────────────────
insert into academic_calendar (title, start_date, end_date, target_grades, description) values
('2학기 수강 정정',            current_date - 30, current_date - 25, null,  '수강 정정 기간'),
('중간고사 성적 확인',          current_date + 4,  current_date + 6,  null,  '종합정보시스템에서 확인'),
('1학년 전공 설명회',           current_date + 6,  current_date + 6,  '{1}', '전공 선택 안내'),
('동계 계절학기 수강신청',       current_date + 10, current_date + 14, null,  '최대 6학점'),
('2027학년도 1학기 휴학·복학 신청', current_date + 20, current_date + 40, null, '종합정보시스템에서 신청'),
('2학기 기말고사',              current_date + 45, current_date + 51, null,  null);

-- ── 학사요람·규정: 진짜 2026 대학요람 PDF에서 넣음 (server/scripts/load_yoram.py, init_db가 자동 실행) ──

-- ── 시연용 가상 학생 4명 (기획안 페르소나) ──────────────────
-- 로그인 없이 시연할 때는 DEV_AUTH=1 로 두고 이 user_id로 접속합니다.
insert into profiles (user_id, email, nickname, department, minor, grade, semester, status, admission_year, interests, completed_requirements, consent_agreed_at) values
('00000000-0000-0000-0000-000000000001', 'demo1@skuniv.ac.kr', '김새내', '소프트웨어학과', null, 1, 2, 'enrolled', 2026, '{장학금}', '{}', now()),
('00000000-0000-0000-0000-000000000002', 'demo2@skuniv.ac.kr', '이도전', '소프트웨어학과', null, 2, 2, 'enrolled', 2025, '{장학금,부전공}', '{}', now()),
('00000000-0000-0000-0000-000000000003', 'demo3@skuniv.ac.kr', '박바뻐', '전자컴퓨터공학과', null, 3, 2, 'enrolled', 2024, '{장학금,취업/인턴}', '{}', now()),
('00000000-0000-0000-0000-000000000004', 'demo4@skuniv.ac.kr', '홍길동', '소프트웨어학과', null, 4, 2, 'enrolled', 2021, '{장학금,취업/인턴}', '{졸업 영어 인증}', now());

-- 1학년 김새내: 1-1 다섯 과목
insert into grades (user_id, term, course_name, credits, grade, area) values
('00000000-0000-0000-0000-000000000001', '1-1', '컴퓨팅사고',     3, 'B+', '전공'),
('00000000-0000-0000-0000-000000000001', '1-1', '파이썬프로그래밍', 3, 'A0', '전공'),
('00000000-0000-0000-0000-000000000001', '1-1', '대학영어',       2, 'B0', '교양 필수'),
('00000000-0000-0000-0000-000000000001', '1-1', '글쓰기와의사소통', 2, 'B+', '교양 필수'),
('00000000-0000-0000-0000-000000000001', '1-1', '심리학의이해',   3, 'A0', '교양 선택');

-- 2학년 이도전: 직전 학기(2-1) 평점이 높음 → 성적우수 장학금 신청 가능
insert into grades (user_id, term, course_name, credits, grade, area)
select '00000000-0000-0000-0000-000000000002', t.term, t.term || ' 과목 ' || g, 3,
       case when t.term = '2-1' then (array['A+','A+','A0','A+','A0'])[g] else 'B+' end,
       case when g <= 3 then '전공' else '교양 선택' end
from (values ('1-1'), ('1-2'), ('2-1')) t(term), generate_series(1, 5) g;

-- 3학년 박바뻐: 직전 학기(3-1) 평점 2.9 → 성적우수 장학금(평점 3.0 이상) 조건 미충족
insert into grades (user_id, term, course_name, credits, grade, area)
select '00000000-0000-0000-0000-000000000003', t.term, t.term || ' 과목 ' || g, 3,
       case when t.term = '3-1' then (array['B0','B0','B+','C+','C+'])[g] else 'B0' end,
       case when g <= 3 then '전공' else '교양 선택' end
from (values ('1-1'), ('1-2'), ('2-1'), ('2-2'), ('3-1')) t(term), generate_series(1, 5) g;

-- 4학년 홍길동: 121학점 (전공 60/66, 교양 필수 18/18, 교양 선택 43) → 졸업까지 9학점 (시안과 같은 숫자)
insert into grades (user_id, term, course_name, credits, grade, area) values
('00000000-0000-0000-0000-000000000004', '4-1', '캡스톤디자인I', 3, 'A+', '전공'),
('00000000-0000-0000-0000-000000000004', '4-1', '소프트웨어공학', 3, 'A0', '전공'),
('00000000-0000-0000-0000-000000000004', '4-1', '인공지능개론',   3, 'B+', '전공');
insert into grades (user_id, term, course_name, credits, grade, area)
select '00000000-0000-0000-0000-000000000004',
       (array['1-1','1-2','2-1','2-2','3-1','3-2'])[1 + (g - 1) % 6], '전공 과목 ' || g, 3, 'A0', '전공'
from generate_series(1, 17) g;
insert into grades (user_id, term, course_name, credits, grade, area)
select '00000000-0000-0000-0000-000000000004',
       (array['1-1','1-2','2-1'])[1 + (g - 1) % 3], '교양 필수 ' || g, 3, 'B+', '교양 필수'
from generate_series(1, 6) g;
insert into grades (user_id, term, course_name, credits, grade, area)
select '00000000-0000-0000-0000-000000000004',
       (array['1-1','1-2','2-1','2-2','3-1','3-2'])[1 + (g - 1) % 6], '교양 선택 ' || g, 3, 'B+', '교양 선택'
from generate_series(1, 14) g;
insert into grades (user_id, term, course_name, credits, grade, area) values
('00000000-0000-0000-0000-000000000004', '3-2', '체육과건강', 1, 'P', '교양 선택');

-- 4학년 홍길동 이번 학기 시간표 (여기에 '모바일앱디자인'을 더하면 금요일 시간이 겹침 → L-7 시연)
insert into timetable (user_id, course_id, course_name, code, credits, category, professor, room, times)
select '00000000-0000-0000-0000-000000000004', id, name, code, credits, category, professor, room, times
from courses where name in ('캡스톤디자인II', '금융빅데이터응용', '빅데이터분석', '서경인성리더십');
