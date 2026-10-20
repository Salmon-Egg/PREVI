# server/ — 우리 서버 (FastAPI)

담당: BE A (`ai/`는 BE B)

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
