# server/ai/ — 자체 AI

담당: BE B

```
server/ai/
├─ client.py   AI를 부르는 유일한 곳. ask_json(지시문 이름, 입력) / embed(문장들)
├─ tasks.py    비서가 AI에게 시키는 일 (①② 공지 정리, ④ 피해 크기, ⑥ 근거, ⑩ 의도, ⑪ 문서 답변, ⑫ 내 상황 답변)
│              AI가 실패해도 문장 틀(템플릿)로 대신해서 서비스가 멈추지 않음
├─ fake.py     가짜 AI. AI_FAKE=1일 때 client.py 대신 답함 (규칙으로 같은 모양의 JSON을 만듦)
└─ prompts/    지시문. 일 하나에 파일 하나
```

## 진짜 AI로 바꾸기
1. `docs/06_AI_운영_가이드.md`대로 Ollama + Kanana(+ 임베딩 모델) 설치
2. 레포 맨 위 `.env`에서 `AI_FAKE=0`, `AI_BASE_URL`, `CHAT_MODEL`, `EMBED_MODEL` 채우기
3. 문서 임베딩 만들기: DB를 새로 만들면 `python -m scripts.init_db`가 자동으로 함
4. 지시문 결과가 이상하면 `prompts/*.txt`만 고치면 됨 (코드는 그대로)

| 지시문 | 쓰는 곳 |
|---|---|
| `notice_summary.txt` | ① 공지 해석 + ② 대상 분류 (조건 변환 포함) |
| `severity.txt` | ④ 놓쳤을 때 피해 크기 |
| `reason.txt` | ⑥ 왜 나에게 해당하는지 |
| `chat_router.txt` | ⑩ 의도 파악 |
| `chat_answer.txt` | ⑪ 문서 근거 답변 |

모델 파일(.gguf 등)은 깃허브에 올리지 않습니다.
