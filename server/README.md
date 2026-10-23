# server/ — 우리 서버 (FastAPI)

담당: BE A (`ai/`는 BE B)

## 처음 실행 (5분)

```
cd server
python -m venv .venv
.venv\Scripts\activate          (맥: source .venv/bin/activate)
pip install -r requirements.txt
```

1. 레포 맨 위의 `.env.example`을 복사해 `.env`를 만들고 `DATABASE_URL`을 채웁니다.
   - Supabase를 쓰면: Supabase › Project Settings › Database › Connection string
   - 내 PC에서 연습만 하려면: `scripts/local_db.py` 안의 설명대로 연습용 Postgres를 켜고, 출력된 주소를 넣기
2. 표 만들기 + 시드 + 예시 공지 수집 + 학생별 계산을 한 번에:
   ```
   python -m scripts.init_db
   ```
3. 서버 켜기:
   ```
   uvicorn main:app --reload
   ```
   → http://localhost:8000/docs 에서 모든 API를 눌러 볼 수 있습니다.
   각 API의 `authorization` 칸에 `Bearer dev-00000000-0000-0000-0000-000000000004` (4학년 홍길동)를 넣으면 로그인됩니다. (`DEV_AUTH=1`일 때, 끝자리 1~4 = 1~4학년 가상 학생)

계산 테스트: `python -m pytest`

## 폴더

```
server/
├─ main.py            서버 시작점 (라우트 연결, 오류 응답 통일)
├─ config.py          .env 읽기 (다른 파일은 os.environ을 직접 읽지 않음)
├─ db.py              DB 실행 함수 3개: all_rows / one / run
├─ auth.py            로그인 확인 (Supabase 토큰 또는 개발용 dev- 토큰)
├─ errors.py          오류를 { "error": { code, message } } 모양으로
├─ agent.py           AI 비서 계산 ③~⑦: 판정 → 할 일 → 우선순위 → 브리핑
├─ notify.py          알림 보내기 (알림은 이 함수 하나로만)
├─ routes/            API 주소별 파일
│  ├─ me.py           GET·PUT·DELETE /me
│  ├─ home.py         GET /home
│  ├─ todos.py        /todos
│  ├─ school.py       /notices /scholarships /scholarship-applications /calendar /graduation /courses
│  ├─ study.py        /grades /timetable
│  ├─ chat.py         POST /chat, /conversations (⑩ 의도 파악 → ⑪ 문서 답변 / ⑫ 내 상황 답변)
│  └─ notifications.py
├─ logic/             숫자 계산 (AI 없음, 테스트 있음): 평점, 졸업 학점, 장학 판정, D-day, 시간 중복
├─ ai/                AI 부르기 → ai/README.md
├─ jobs/              정해진 시각 작업 → jobs/README.md
├─ scripts/           init_db.py (DB 처음 만들기), local_db.py (연습용 Postgres)
└─ tests/             python -m pytest
```

## 지금 상태 (MVP 뼈대, 10/23)

| 항목 | 상태 |
|---|---|
| API 명세의 모든 주소 | 동작함 (가상 학생 4명으로 확인) |
| AI | **가짜 AI**(`AI_FAKE=1`, `ai/fake.py`)로 동작. Ollama가 준비되면 `.env`만 바꾸면 됨 |
| 공지 수집 | 예시 공지(`jobs/sample_board.json`)로 동작. 학교 게시판 주소·구조 확인 후 `.env`의 BOARD_ 값 채우기 |
| 푸시 | 알림 센터 기록까지 동작. 실제 발송은 `PUSH_ENABLED=1` + 앱 개발 빌드 필요 |
| 졸업 기준·학사요람 문장 | **예시 값**. 실제 학사요람을 받으면 `supabase/seed/seed.sql` 수정 |

## 지킬 것
- 응답 모양은 `docs/04_API_명세.md`와 똑같이 맞춥니다. 다르게 해야 하면 문서부터 고칩니다.
- 비밀 키는 `.env`에서 읽습니다. 코드에 직접 쓰지 않습니다.
- 숫자 계산은 `logic/`에서 코드로, 글 읽기·판단·문장 쓰기만 `ai/`에서 AI로.
