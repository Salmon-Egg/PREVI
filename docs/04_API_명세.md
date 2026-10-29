# API 명세 (초안)

> **상태: 초안 · 조장 확인 전.** 확정되면 이 줄을 지웁니다.
> 바꿀 때는 [작업 규칙 6번](02_작업_규칙.md)대로 이 문서부터 고칩니다.

FE와 BE의 **약속**입니다. FE는 서버가 완성되기 전까지 이 문서의 예시 응답으로 화면을 만들고, BE는 이 모양 그대로 응답하도록 만듭니다.
서버를 실행하면 `http://서버주소/docs`에서 FastAPI가 자동으로 만든 문서도 볼 수 있습니다.

---

## 0. 읽는 법

- **API**: 앱이 서버에 "이거 줘", "이거 저장해 줘"라고 요청하는 주소입니다.
- **GET** = 가져오기 · **POST** = 새로 만들기 · **PUT** = 통째로 고치기 · **PATCH** = 일부만 고치기 · **DELETE** = 지우기
- 예시의 `{ ... }` 모양은 **JSON**입니다. `"이름": 값` 쌍을 묶은 것입니다.

## 1. 공통 약속

| 항목 | 약속 |
|---|---|
| 로그인 확인 | 모든 요청 머리에 `Authorization: Bearer <Supabase 로그인 토큰>` |
| 날짜 | `"2026-10-20"` · 날짜+시각 `"2026-10-20T09:00:00+09:00"` · 시각만 `"09:00"` |
| 학기 | `"4-1"` = 4학년 1학기 |
| 비어 있는 값 | `null` (빈 목록은 `[]`) |

**오류 응답** (모든 API 같은 모양)

```json
{ "error": { "code": "TIME_CONFLICT", "message": "화 10:30~12:00 소프트웨어공학과 시간이 겹쳐요" } }
```

| 상태 번호 | 뜻 |
|---|---|
| 400 | 보낸 값이 잘못됨 |
| 401 | 로그인 안 됨 |
| 404 | 없는 항목 |
| 409 | 규칙에 걸림 (시간 중복, 학점 초과 등) |
| 500 | 서버 오류 |

---

## 2. 목록

| 요청 | 하는 일 | 화면 |
|---|---|---|
| `GET` · `PUT /me` | 내 정보 조회·수정 (학적, 동의, 알림 설정, 푸시 토큰) | M-2, M-3, M-4, M-5 |
| `GET /home` | 홈에 필요한 것 한 번에 | 홈 |
| `GET /todos` · `GET /todos/{id}` · `POST /todos` · `PATCH /todos/{id}` | 할 일 목록·상세·추가·완료 | T-1, T-2, T-3 |
| `GET /notices` · `GET /notices/{id}` | 나에게 해당하는 공지 목록·상세 | A-1, S-2 |
| `GET /scholarships` | 장학금 판정 목록 | S-1 |
| `GET /scholarship-applications` | 장학 신청 내역 | S-3 |
| `GET /calendar` | 학사일정 | A-2 |
| `GET /graduation` | 졸업 요건 진행 상황 | L-1, L-2 |
| `GET /grades` · `POST /grades` · `PUT /grades/{id}` · `DELETE /grades/{id}` | 성적 | L-8 ~ L-10 |
| `GET /courses?q=` | 과목 검색 | L-5 |
| `GET /timetable` · `POST /timetable` · `DELETE /timetable/{id}` | 시간표 | L-3 ~ L-7 |
| `POST /chat` | 챗봇에게 질문 | H-1, H-2 |
| `GET /conversations` · `GET /conversations/{id}` | 대화 목록·내용 | H-3 |
| `GET /notifications` · `PATCH /notifications/{id}` | 받은 알림·읽음 처리 | T-4 |
| `DELETE /me` | 계정 삭제 (성적 포함 모든 데이터) | M-3 |
| `PATCH /conversations/{id}` | 대화 고정 `{ "pinned": true }` | H-3 |

> MVP 뼈대(10/23)에서 더한 것: `DELETE /me`, `PATCH /conversations/{id}`, `GET /conversations?q=` 검색,
> `GET /me`의 `completed_requirements`, `GET /notices/{id}`의 `eligibility`·`todo_id`·`applied`(S-2 판정·신청 완료 체크용),
> 처음 쓰는 학생은 `GET /me`·`/home`이 `404 NO_PROFILE` → 앱이 처음 설정(M-2)으로 보냄. (조장 확인 필요)

---

## 3. 자세히

### 내 정보 `GET /me`

```json
{
  "nickname": "홍길동",
  "department": "소프트웨어학과",
  "minor": null,
  "grade": 4,
  "semester": 1,
  "status": "enrolled",
  "admission_year": 2021,
  "interests": ["장학금", "취업/인턴"],
  "consent": { "agreed": true, "agreed_at": "2026-10-20T10:00:00+09:00" },
  "notify": { "notice": true, "deadline": true, "calendar": true, "chat": true, "time": "09:00" }
}
```

- `status`: `enrolled`(재학) · `leave`(휴학) · `returned`(복학)
- `PUT /me`: 바꿀 항목만 보내도 됩니다. 푸시 토큰 등록은 `{ "push_token": "ExponentPushToken[...]" }`
- `status`를 `leave`로 바꾸면 서버가 휴·복학 할 일을 자동으로 만듭니다.

### 홈 `GET /home`

- `today_todos`: 급한 순 최대 9개 (홈 카드가 3개씩 3쪽)
- `unread_notifications`: 안 읽은 알림 수 (종 아이콘 빨간 점)

```json
{
  "nickname": "홍길동",
  "unread_notifications": 2,
  "briefing": "오늘 마감 2개, 장학금 1개 신청 가능해요",
  "today_todos": [
    { "id": 31, "type": "graduation", "title": "졸업작품 심사 신청", "due_date": "2026-10-20", "d_day": 0 }
  ],
  "next_event": { "id": 5, "title": "수강 정정", "start_date": "2026-10-23", "d_day": 3 },
  "menu_status": {
    "study": "졸업까지 9학점",
    "scholarship": "신청 가능 1건 · 오늘 마감",
    "admin": "새 공지 2건",
    "campus": "준비 중"
  },
  "suggested_questions": ["졸업까지 뭐가 남았어?", "장학금 신청 마감 언제야?", "수강 정정이 뭐야?"]
}
```

### 할 일 `GET /todos?type=deadline&done=false`

목록은 D-day 가까운 순입니다. `type`과 `done`은 빼도 됩니다.

```json
[
  {
    "id": 31,
    "type": "graduation",
    "title": "졸업작품 심사 신청",
    "due_date": "2026-10-20",
    "d_day": 0,
    "done": false
  }
]
```

- `type`: `deadline`(마감) · `scholarship`(장학) · `graduation`(졸업) · `status`(학적)

`GET /todos/{id}` 는 위 내용에 아래를 더해 줍니다.

```json
{
  "reason": "4학년 2학기 졸업 예정자는 심사를 신청해야 해요. 아직 신청 기록이 없어요.",
  "link": "https://...",
  "source": { "kind": "notice", "id": 102 },
  "done_at": null
}
```

- `PATCH /todos/{id}` `{ "done": true }` → 완료. 장학 할 일이면 신청 내역에도 기록됩니다.
- `POST /todos` `{ "title": "...", "due_date": "2026-10-30", "type": "deadline", "source": { "kind": "notice", "id": 102 } }` → 챗봇 "마감 알림 받기" 버튼에서 사용

### 공지 `GET /notices` · `GET /notices/{id}`

```json
{
  "id": 102,
  "title": "2026-2학기 교내 성적우수 장학금 신청 안내",
  "category": "장학",
  "summary": ["대상: 직전 학기 평점 3.5 이상 재학생", "마감: 10/30(금) 18:00", "서류: 신청서, 성적증명서"],
  "deadline": "2026-10-30T18:00:00+09:00",
  "documents": ["신청서", "성적증명서"],
  "url": "https://학교게시판/글주소",
  "posted_at": "2026-10-20T09:00:00+09:00"
}
```

목록(`GET /notices`)은 `id`, `title`, `category`, `deadline`, `posted_at`, `summary`의 첫 줄만 줍니다.
상세(`GET /notices/{id}`)는 위에 더해 `body`(공지 원문, 시안 13), `eligibility`, `todo_id`, `applied`를 줍니다.

### 장학금 `GET /scholarships`

```json
[
  {
    "notice_id": 102,
    "title": "성적우수 장학금",
    "deadline": "2026-10-30T18:00:00+09:00",
    "verdict": "eligible",
    "reasons": ["직전 학기 평점 4.0 (기준 3.5 이상) ✓", "재학생 ✓"],
    "applied": false,
    "applied_at": null
  }
]
```

- 신청 완료한 장학금은 마감이 지나도 목록에 남고 맨 위에 옴 (시안 12 "신청 완료" 카드)

- `verdict`: `eligible`(신청 가능) · `ineligible`(조건 미충족) · `check`(확인 필요: 소득분위처럼 앱이 모르는 조건이 있을 때)

### 졸업 요건 `GET /graduation`

- 학과명·입학년도와 정확히 일치하는 등록 기준을 우선 사용한다.
- 2021~2024학번이 개편 후 이름인 `컴퓨터소프트웨어전공`을 선택했고 정확한 기준이 없을 때, 같은 입학년도의 `소프트웨어학과` 등록 기준을 **참고 기준**으로 표시할 수 있다. 프로필이나 DB 기준은 변경하지 않는다.
- 참고 기준에서는 `required_total`과 `areas[].required`도 개인 적용이 확정된 수치가 아니다. `requirements`의 확인 안내를 함께 표시하고 `remaining_total=null`로 반환한다. FE는 이를 졸업 가능·학점 충족으로 표시하지 않는다.
- 홈과 챗봇에서도 남은 학점을 단정하지 않는다. 알려지지 않은 학과·학번, 통합 전 컴퓨터공학과·전자공학과에는 이 참고 기준 연결을 확장하지 않는다.

```json
{
  "required_total": 130,
  "earned_total": 121,
  "remaining_total": 9,
  "areas": [
    { "name": "전공", "required": 66, "earned": 60 },
    { "name": "교양 필수", "required": 18, "earned": 18 }
  ],
  "requirements": [
    { "name": "졸업 영어 인증", "done": true },
    { "name": "졸업작품 심사 신청", "done": false, "todo_id": 31 }
  ]
}
```

### 성적 `GET /grades`

```json
[
  {
    "term": "4-1",
    "gpa": 4.0,
    "items": [
      { "id": 7, "course_name": "캡스톤디자인I", "credits": 3, "grade": "A+", "area": "전공" }
    ]
  }
]
```

- `POST /grades` `{ "term": "4-1", "course_name": "...", "credits": 3, "grade": "A+", "area": "전공" }`
- `grade`: `A+` `A0` `B+` `B0` `C+` `C0` `D+` `D0` `F` `P`
- 저장·수정·삭제하면 졸업 요건과 장학 판정을 다시 계산하고, 응답에 바뀐 결과를 함께 줍니다.

```json
{ "item": { "id": 8, "...": "..." }, "recalculated": { "remaining_total": 6, "new_eligible_scholarships": 1 } }
```

### 과목 검색 `GET /courses?q=소프트`

```json
[ { "id": 40, "name": "빅데이터분석", "code": "CS0355", "credits": 3, "area": "전공", "category": "전선",
    "professor": "박데이터", "room": "정보301", "times": [ { "day": "수", "start": "13:00", "end": "16:00" } ] } ]
```

- `q`는 과목명 또는 과목코드. 시간은 교시 단위로 넣고(01교시 = 09:00~10:00), 앱이 "수 05,06,07"로 보여 줌

### 시간표 `GET /timetable` · `POST /timetable`

```json
{ "id": 3, "course_id": 40, "course_name": "빅데이터분석", "code": "CS0355", "credits": 3, "category": "전선",
  "professor": "박데이터", "room": "정보301", "times": [ { "day": "수", "start": "13:00", "end": "16:00" } ] }
```

- `POST`는 과목 검색 결과 `{ "course_id": 40 }` 또는 직접 입력 `{ "course_name": "...", "credits": 3, "category": "전공" | "교양", "room": "...", "professor": "...", "times": [...] }`
- 시간이 겹치면 `409` + `TIME_CONFLICT`, 학기 학점 상한을 넘으면 `409` + `CREDIT_LIMIT` (L-7 화면)
- `TIME_CONFLICT`의 `message`는 두 줄: `"강의 시간 중복 (금요일 04교시)\n기존 수강 과목 [서경인성리더십]과 수업 시간대가 서로 겹칩니다."` (시안 08 그대로)

### 챗봇 `POST /chat`

보내는 것:

```json
{ "conversation_id": null, "text": "졸업까지 뭐가 남았어?", "context": { "kind": "todo", "id": 31 } }
```

- 새 대화면 `conversation_id`는 `null`
- `context`는 할 일 상세의 "채팅으로 묻기"처럼 다른 화면에서 넘어올 때만. 아니면 `null`

받는 것 (**챗봇 답변 형식은 항상 이 모양**):

```json
{
  "conversation_id": 12,
  "message": {
    "id": 88,
    "text": "졸업까지 2가지가 남았어요. 졸업작품 심사 신청이 오늘 마감이에요.",
    "cards": [
      { "image_url": null, "title": "졸업까지 남은 학점", "lines": ["9학점", "121 / 130"], "link": null }
    ],
    "sources": [ { "title": "2026 학사요람", "url": "https://..." } ],
    "actions": [
      { "type": "add_todo", "label": "마감 알림 받기", "payload": { "title": "졸업작품 심사 신청", "due_date": "2026-10-20" } },
      { "type": "open_link", "label": "신청 페이지", "payload": { "url": "https://..." } },
      { "type": "open_screen", "label": "남은 전공 과목", "payload": { "screen": "L-2" } }
    ]
  }
}
```

- `cards`: 넘겨 보는 카드. 공지·졸업 요건·(분실물) 모두 같은 모양 → FE는 카드 부품을 한 번만 만들면 됩니다.
- `actions`: 답변 아래 버튼. `add_todo` 누르면 FE가 `POST /todos`를 부릅니다.
- 답을 모를 때도 같은 모양이고, `text`가 "학교 문서에서 근거를 찾지 못했어요..." 같은 문장, 나머지는 빈 목록입니다.

### 대화 `GET /conversations` · `GET /conversations/{id}`

```json
[ { "id": 12, "title": "졸업까지 뭐가 남았어?", "pinned": false, "updated_at": "2026-10-20T10:00:00+09:00" } ]
```

상세는 `messages` 목록을 줍니다. 각 메시지는 `{ "id", "role": "user" | "assistant", "text", "cards", "sources", "actions", "created_at" }`

### 알림 `GET /notifications` · `PATCH /notifications/{id}`

```json
[
  {
    "id": 501,
    "type": "notice",
    "title": "2학기 교내 장학금 신청 공지가 올라왔어요. 마감 10/30",
    "target_id": 102,
    "read": false,
    "sent_at": "2026-10-20T09:05:00+09:00"
  }
]
```

- `PATCH /notifications/{id}` `{ "read": true }` → 읽음

**알림 형식은 항상 이 모양**입니다. 휴대폰 푸시의 `data`에도 `type`, `title`, `target_id`가 똑같이 들어갑니다.
알림을 누르면 열 화면:

| type | 여는 화면 | target_id |
|---|---|---|
| `notice` | 공지 상세 (장학 공지면 S-2) | 공지 번호 |
| `deadline` | T-2 할 일 상세 | 할 일 번호 |
| `calendar` | A-2 학사 일정 | 일정 번호 |
| `chat` | H-2 채팅 | 대화 번호 |
