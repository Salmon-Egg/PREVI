# supabase/ — 데이터 표와 시드 데이터

담당: BE A

## 첫 실행

`migrations/001_profiles.sql` 전체를 Supabase SQL Editor에 붙여넣고 Run을 누릅니다.
`profiles`의 `rowsecurity`가 `true`이면 표와 RLS가 생성된 것입니다.
다른 사용자 접근 차단은 별도 테스트 계정으로 검증해야 합니다.
이미 생성된 표가 있으면 재실행 시 오류가 납니다. 기존 표를 삭제하지 말고 상태를 확인하세요.
학교 이메일 제한은 `migrations/002_school_email_hook.sql`로 설정합니다.

## 학교 이메일 가입 제한

1. SQL Editor의 새 쿼리에서 `002_school_email_hook.sql` 전체를 실행합니다.
2. Authentication > Hooks에서 Before User Created 항목에 Postgres 함수를 연결합니다.
3. schema는 `public`, 함수는 `hook_school_email_only`를 선택하고 저장·활성화합니다.
4. 이메일 설정의 Confirm Email을 켜서 실제 학교 메일 소유 여부를 인증합니다.

SQL 파일 생성·실행만으로는 가입 제한이 켜지지 않습니다. Hook 연결이 필요합니다.
SQL 실행 시 학교 도메인 허용·유사 도메인 차단을 함수로 검사하며 실제 계정이나 메일을 만들지 않습니다.
기존 계정은 삭제하지 않습니다. 기존 외부 이메일 계정은 서버 인증에서 차단합니다.
관리자의 Auto Confirm 테스트 계정은 실제 메일 소유 확인을 생략하므로 시연용으로만 사용합니다.

공식 문서: https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook

## 과목·성적 표

SQL Editor의 새 쿼리에서 `migrations/003_courses_grades.sql` 전체를 실행합니다.
결과에 `courses`, `grades` 두 줄이 나오고 둘 다 `rowsecurity=true`인지 확인합니다.
학교 과목·졸업 기준이나 실제 학생 데이터는 이 파일에 넣지 않았습니다.
과목은 관리자만 추가하고, 인증 사용자는 검색만 할 수 있습니다.
성적은 본인만 조회·추가·수정·삭제하며 계정 삭제 시 함께 삭제됩니다.

## 졸업 최소 요건 표

`migrations/004_graduation_requirements.sql` 전체를 새 SQL 쿼리에서 실행합니다.
소프트웨어학과 2021~2024, 전자컴퓨터공학과 2023~2024의 총 6줄이 생성됩니다.
각 줄의 총 학점은 120입니다. 이 표는 최소 요건 점검용으로 최종 졸업사정 기준 전체가 아닙니다.
다른 학번은 증빙 확보 후 별도 마이그레이션으로 추가하며, 기존 기준을 추정해서 복사하지 않습니다.
확인 근거는 `research/졸업요건_공식자료_조사.md`를 참고하세요.

## 시간표 표

`migrations/005_timetable.sql` 전체를 새 SQL 쿼리에서 실행합니다.
`timetable`과 `rowsecurity=true`가 나오면 표와 검사 함수가 생성된 것입니다.
학년·학기를 저장하는 내부 `term`이 있으며 학생은 본인 시간표만 조회·추가·삭제합니다.
과목 선택 시 원본 과목 정보를 복사하고, 프로필 행 잠금으로 동시 요청의 중복·상한 초과를 방지합니다.
사용자 프로필에 학과·입학년도·학년·학기가 있어야 등록할 수 있습니다.
`004_graduation_requirements.sql`이 먼저 적용되어 있어야 합니다.
수강 상한 및 입력 성적 기반 추정의 한계는 `server/README.md`의 시간표 절을 참고하세요.

## 공지·할 일 표

`migrations/006_notices_todos.sql`을 새 SQL 쿼리에서 실행합니다.
`notices`, `eligibility`, `todos`, `scholarship_applications` 네 줄 모두 RLS가 true여야 합니다.
공지 원문은 서버 수집기만 저장하고, 학생별 판정은 처리 코드만 기록합니다.
학생은 본인 할 일을 추가하고 `done`만 변경할 수 있습니다.
장학 할 일의 완료·완료 취소는 신청 기록과 함께 반영됩니다.
공지의 AI 처리 대기 상태와 첨부 식별자는 내부 처리용이며 API 응답 모양에는 추가하지 않았습니다.

## 학사일정 표

`migrations/007_academic_calendar.sql`을 새 쿼리에서 실행합니다.
공식 2026 요람에서 확인한 초기 일정 8건이 날짜순으로 나옵니다.
인증 사용자는 조회만 할 수 있고 수정은 서버 관리자만 할 수 있습니다.
`target_grades`가 빈 배열이면 공통 일정이며, `source_url`은 내부 근거 확인용입니다.
자동 일정 수집은 아직 없으므로 요람 이후 변경은 교무처 최신 공지와 비교해야 합니다.

## 알림 표

`migrations/008_notifications.sql` 전체를 새 SQL 쿼리에서 실행합니다.
`notifications`, `rowsecurity=true`가 나오면 됩니다.
학생은 본인 기록의 공개 필드만 읽고 `read`만 바꿀 수 있습니다.
발송 예약 함수는 서버 전용이며 설정·동의·대상 검증과 중복 예약을 같은 트랜잭션에서 처리합니다.
내부 `event_key`는 전날/당일 등 발송 회차를 구분하며 기본값 once는 대상별 한 번입니다.
실제 휴대폰 전송은 SQL 실행으로 켜지지 않습니다. `PUSH_ENABLED`의 기본값은 false입니다.

## 여기에 들어갈 것
```
supabase/
├─ migrations/   표 만들기 SQL (001_init.sql, 002_… 순서대로)
└─ seed/         처음에 넣어 두는 데이터
                 - 졸업 기준 (소프트웨어학과, 전자컴퓨터공학과)
                 - 학사일정, 과목 목록, 학사요람 문서
                 - 시연용 가상 학생 4명 (기획안 페르소나: 1학년 김새내 ~ 4학년 홍길동)
```

표 설계는 `docs/05_데이터_표.md`를 따릅니다. 표를 바꾸면 그 문서도 함께 고칩니다.
실제 학생 정보는 넣지 않습니다.
