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
- `recalculated.remaining_total`, `recalculated.new_eligible_scholarships`는 현재 `null`입니다.
  졸업 기준과 장학 판정 파이프라인을 연결하기 전까지 완료된 계산으로 취급하면 안 됩니다.
  졸업 요건·장학 재계산 기능은 아직 미완료입니다.

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
