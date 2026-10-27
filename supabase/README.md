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
