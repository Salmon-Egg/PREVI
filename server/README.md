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
학교 이메일 제한, 학적 변경 후 할 일 생성·재계산은 아직 연결하지 않았습니다.

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
