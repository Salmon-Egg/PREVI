# server/ — 우리 서버 (FastAPI)

담당: BE A (`ai/`는 BE B)

## 현재 구현과 실행

Python 3.10 이상, 저장소 최상위 폴더에서 실행합니다.

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r server/requirements-dev.txt
.venv\Scripts\python.exe -m uvicorn server.main:app --reload
```

최상위 `.env`에는 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`가 필요합니다.
인증은 사용자 Bearer 토큰을 Supabase `/auth/v1/user`에 보내 검증합니다.
이 단계에서는 Secret key를 사용하지 않습니다. JWKS를 통한 로컬 검증도 아직 사용하지 않습니다.

- `http://localhost:8000/health`: 실행 확인 (DB 연결 검사는 아님)
- `http://localhost:8000/docs`: API 문서
- `auth.require_user`: 각 API에서 재사용할 로그인 검증 의존성
- 오류는 `{ "error": { "code": "...", "message": "..." } }` 형식입니다.
- 테스트: `.venv\Scripts\python.exe -m pytest server/tests -q`

`GET /me`, `PUT /me`의 기본 조회·부분 수정도 구현했습니다.
먼저 `supabase/migrations/001_profiles.sql`을 Supabase SQL Editor에서 실행하세요.
첫 `PUT /me`가 본인 프로필을 만들며, 저장 전 `GET /me`는 404를 반환합니다.
알림 종류는 처음에는 꺼져 있고, 동의 시각은 서버가 기록합니다.
인증 시 `@skuniv.ac.kr` 도메인과 이메일 인증 완료 여부를 확인합니다.
기존 외부 이메일 계정은 삭제하지 않지만 API 접근은 차단합니다.
가입 자체의 제한은 `supabase/migrations/002_school_email_hook.sql` 실행 후
Supabase Authentication > Hooks에서 Before User Created에
`public.hook_school_email_only`를 연결해야 활성화됩니다.
이메일 소유 확인을 위해 Supabase의 Confirm Email도 켜 두세요.
학적 변경 후 할 일 생성·재계산은 아직 연결하지 않았습니다.

### 성적·과목

`supabase/migrations/003_courses_grades.sql` 실행 후 사용할 수 있습니다.

- `GET /courses?q=`: 과목 이름 부분 검색 (최대 100개). 실제 과목 목록은 별도 입력이 필요합니다.
- `GET /grades`: 본인 성적을 최신 학기순으로 묶고 학점 가중 평점을 계산합니다.
- `POST /grades`, `PUT /grades/{id}`, `DELETE /grades/{id}`: 본인 성적을 추가·전체 수정·삭제합니다.
- 같은 학기의 같은 과목 이름은 중복 저장할 수 없습니다 (409).
- 과목표는 로그인 사용자에게 읽기만 허용하고, 성적표는 자기 데이터만 읽고 고칠 수 있습니다.
- `004_graduation_requirements.sql` 적용 후 지원 학과·학번은 성적 변경 시
  `recalculated.remaining_total`을 다시 계산합니다. 기준 미확정·프로필 미설정·재수강 중복·DB 장애 시에는 `null`입니다.
- `recalculated.new_eligible_scholarships`는 장학 판정기 연결 전이라 아직 `null`입니다.

평점 기준표와 둘째 자리 이하 처리 근거:
https://www.skuniv.ac.kr/exam-and-grade (소수점 셋째 자리 이하 절사)
P는 평점 계산에서 제외하고, 등급제 F는 0점으로 계산합니다.
현재 API 명세에 없는 NP·계절학기·학점포기·재수강 대체 규칙은 지원하지 않습니다.
실제 적용 전에 입력 형식과 규칙을 팀과 확정해야 합니다.

실제 Supabase 통합 검사: `.venv\Scripts\python.exe -m server.check_grades_live`
로컬 `.env`의 Secret key가 필요합니다. 임시 가상 학교 계정 2개와 과목 1개를 만들고
성적 CRUD·평점 갱신·중복 차단·RLS·계정 삭제 연쇄 정리를 검사한 뒤 임시 데이터를 삭제합니다.
기존 사용자와 과목은 변경하지 않습니다. 실제 메일도 보내지 않습니다.
2026-10-27: 과목·성적 표 적용 후 위 검사 모두 통과했습니다.

### 졸업 최소 요건 점검

먼저 `supabase/migrations/004_graduation_requirements.sql`을 실행하세요.
`GET /graduation`은 입력한 성적 기준으로 총 학점·영역별 학점과 필수과목 이수 여부를 보여줍니다.

- 초기 범위: 소프트웨어학과 2021~2024학번, 전자컴퓨터공학과 2023~2024학번.
- 기준: 총 120학점, 전공 48학점, 교양 합계 33학점. 세부 교과·학과 내규는 별도로 확인해야 합니다.
- F는 취득 학점에서 제외하고 P는 취득 학점에 포함합니다.
- 공백·대소문자를 정규화해 과목 이름을 비교합니다. 코드·대체과목·학점포기 자동 판정은 지원하지 않습니다.
- 서로 다른 학기에 같은 과목을 여러 번 취득한 경우 임의로 합산하지 않고 학점 결과를 `null`로 표시합니다.
- `requirements[].done`의 `false`는 입력 성적에서 이수가 확인되지 않았다는 뜻입니다.
  실제 미이수 확정이나 졸업 불가 판정이 아닙니다.
- `done: null`은 작품 심사·영역별 교양·예외 승인 등 확인이 필요한 항목입니다.
- 남은 학점이 0이어도 졸업 가능 확정이 아닙니다. 별도 확인 항목은 유지됩니다.
- 2025년 이후 개편 전공, 전컴공 2022학번 이전 및 부전공 등록자는 자동 기준 적용을 보류합니다.
- 기존 `/me`를 수정한 내용은 다음 `/graduation` 조회에 바로 반영됩니다. 할 일·브리핑 갱신은 아직 미연결입니다.

근거와 미확정 사항: `supabase/research/졸업요건_공식자료_조사.md`.
현재 영어 졸업요건과 CREOS·SKON·DREAM은 등록하지 않습니다.
이 단계는 최종 졸업사정 자동화가 아닌 입력 성적 기반 최소 요건 점검입니다.

실제 DB 재검사: `.venv\Scripts\python.exe -m server.check_graduation_live`
2026-10-27: 6개 학과·학번 기준, 성적 추가/F/P/삭제 후 잔여 학점,
학과 변경, 미확정 학번·부전공 보류, 기준 수정 권한 차단, 임시 데이터 정리까지 통과했습니다.
검사에는 임시 계정 1개를 사용하며 기존 사용자·졸업 기준은 변경하지 않습니다.

### 시간표

`supabase/migrations/005_timetable.sql` 적용 후 `GET /timetable`, `POST /timetable`,
`DELETE /timetable/{id}`를 사용할 수 있습니다. 과목 선택(`course_id`)과 직접 입력을 지원합니다.
응답은 명세대로 `id`, `course_name`, `credits`, `times`입니다.

- 내부 `term`에는 프로필의 학년·학기를 저장하고 현재 학기의 시간표만 조회합니다.
- 학기별 시간표 계획이며 학교 포털의 실제 수강신청을 하지 않습니다.
- 종료 시각과 다음 과목 시작 시각이 같으면 허용합니다. 같은 과목 안의 시간 중복은 입력 오류입니다.
- 다른 과목과 겹치면 `409 TIME_CONFLICT`, 상한 초과는 `409 CREDIT_LIMIT`입니다.
- DB에서 사용자 프로필 행을 잠근 뒤 시간 중복·학점 합계를 검사해 동시 추가 요청을 보호합니다.
- 과목 선택 시 DB의 이름·학점·시간을 사용합니다. 사용자 전송값으로 학점을 낮출 수 없습니다.
- 현재 고정 시간 수업만 지원하며 빈 시간표(비동기·시간 미정) 과목은 확인이 필요합니다.
- 수강 상한은 등록된 졸업 기준 120학점이면 19, 130학점이면 20입니다.
  입력된 직전 학기 평점이 4.35 이상이면 3학점을 더합니다.
  직전 학기 입력 평점이 1.6 미만이면 학사경고 가능성 때문에 15학점을 적용합니다.
- 직접 입력 성적이 불완전하거나 학사경고 해제·이월·초과학기 등 예외가 있으면 학교 확인이 필요합니다.
  포털에서 확인한 공식 수강 가능 학점과 다를 수 있습니다. 공식 학사경고 기록은 자동 판정하지 않습니다.
- 지원하지 않는 학과·학번에는 상한을 추측하지 않고 `CREDIT_RULES_UNKNOWN`으로 응답합니다.
- 시간표의 수강 예정 학점은 취득한 졸업 학점에 더하지 않습니다.
  필수과목 누락 경고와 할 일·브리핑 재생성은 추후 파이프라인 연결 대상입니다.

규정 근거: https://www.skuniv.ac.kr/notice/65877,
https://www.skuniv.ac.kr/course-registration,
https://www.skuniv.ac.kr/academic-status (2026-10-27 확인).

실제 DB 재검사: `.venv\Scripts\python.exe -m server.check_timetable_live`
2026-10-27: 등록·조회·삭제, 학기 분리, 중복 시간, 19/22/15학점 경계,
과목 학점 위조 차단, 동시 요청의 시간·상한 차단, 타인 접근 제한을 통과했습니다.
검사에서 만든 계정 2개·과목 1개와 관련 데이터는 정리했습니다.

### 공지·할 일

`supabase/migrations/006_notices_todos.sql`을 먼저 실행합니다.

- `GET /notices`: 본인 `eligibility` 판정이 `eligible` 또는 `check`인 공지만 최근순으로 조회합니다.
  AI 추출·학생별 판정을 연결하기 전까지는 빈 목록이 정상입니다.
- `GET /notices/{id}`: 공개 공지 상세. AI 처리 전에는 `summary`, `documents`가 빈 목록이고 `deadline`은 null입니다.
- `GET /todos?type=deadline&done=false`: 마감일순, 날짜가 없는 일은 마지막. D-day는 한국 날짜 기준입니다.
- `GET /todos/{id}`, `POST /todos`, `PATCH /todos/{id}`: 본인 할 일 상세·등록·완료/완료 취소.
- `GET /scholarship-applications`: 앱에서 완료로 체크한 본인 장학 신청 기록입니다.
- 공지 연결은 `source: {"kind":"notice","id":번호}`입니다. 공지당 본인 할 일은 한 번만 등록할 수 있습니다.
- 장학 할 일은 장학 공지 연결이 필수입니다. 완료 시 신청 기록을 한 번만 만들고,
  완료 취소 시 앱 내 신청 기록도 제거합니다. 실제 학교 신청/취소를 수행하는 기능은 아닙니다.
- 상태 시각과 신청 기록은 DB 트리거가 동일 트랜잭션에서 처리합니다.
- 개인별 판정과 신청 기록은 학생이 임의로 만들거나 수정할 수 없습니다.
- 현재 목록 API는 최대 100개입니다. 자동 할 일·브리핑·푸시 발송과 장학 판정 계산은 아직 미연결입니다.

수집 미리보기: `.venv\Scripts\python.exe -m server.jobs.collect_notices --max-posts 3`
실제 저장: `.venv\Scripts\python.exe -m server.jobs.collect_notices --save --pages 3 --max-posts 150`
학교 요청과 Supabase 요청은 별도 클라이언트를 사용하고, 서버 키는 Supabase에만 전송합니다.
수집은 글 번호로 중복을 막으며 기존 AI 결과를 덮어쓰지 않습니다.
오류는 로그와 실패 수에 기록되고, 실패한 글은 저장되지 않아 다음 실행에서 다시 시도합니다.
현재 첫 수집 범위는 지정 페이지 안의 글입니다. 과거 전체 공지 소급 수집이나 기존 글 수정 감지는 별도 작업입니다.

BE B 연결: `notices.extraction_status=pending` 글의 `body`와 `attachments`를 읽어
`summary`, `deadline`, `documents`, `target`, `conditions`를 채운 뒤 `ready`로 변경합니다.
대상 비교 코드가 `eligibility`를 생성해야 맞춤 공지 목록에 나타납니다.
본문만으로 대상·마감·자격을 추정해서 확정하지 않습니다.
`attachments`에는 파일명, 확인된 URL 또는 `file_key`를 보관합니다. 식별자만 있는 첨부는 다운로드하지 않습니다.
2026-10-27: 공개 학사 공지 3건을 실제 DB에 저장했고, 두 번째 수집은 3건 모두 건너뛰었습니다.
AI 처리 전 원문만 저장했으며 맞춤 판정·할 일·알림은 자동 생성하지 않았습니다.

실제 DB 검사: `.venv\Scripts\python.exe -m server.check_notices_todos_live`
같은 날 공지 중복 방지, 개인별 판정 조회, 할 일 등록·완료·취소·재완료,
신청 기록 동시 반영·중복 방지, 타인 접근·기록 위조 차단을 통과했습니다.
검사에서 만든 가상 계정 2개와 가상 공지는 삭제했습니다. 실제 수집한 공개 공지 3건은 유지했습니다.

## 여기에 들어갈 것
```
server/
├─ main.py         서버 시작점
├─ routes/         API 주소별 파일 (me.py, home.py, grades.py, chat.py …)
├─ logic/          숫자 계산 (졸업 학점, 장학 판정, D-day, 시간 중복) — AI 없이 코드로, 테스트 포함
├─ notify.py       알림 보내는 함수 (알림은 이 함수 하나로만 보냄)
├─ ai/             AI 부르는 코드와 지시문 → ai/README.md
└─ jobs/           정해진 시각에 도는 작업 → jobs/README.md
```

## 지킬 것
- 응답 모양은 `docs/04_API_명세.md`와 똑같이 맞춥니다. 다르게 해야 하면 문서부터 고칩니다.
- 비밀 키는 `.env`에서 읽습니다. 코드에 직접 쓰지 않습니다.
- 서버를 실행하면 `http://localhost:8000/docs`에서 API 문서를 볼 수 있습니다.
