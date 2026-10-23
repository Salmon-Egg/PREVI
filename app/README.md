# app/ — 모바일 앱 (Expo SDK 58 + Expo Router)

담당: FE A · FE B

## 처음 실행

```
cd app
npm install
copy .env.example .env      (맥: cp .env.example .env)
npx expo start              → 휴대폰 Expo Go로 QR 찍기, 또는 w 눌러 웹으로 열기
```

| 하고 싶은 것 | app/.env |
|---|---|
| 서버 없이 화면만 만들기 | `EXPO_PUBLIC_USE_MOCK=1` (mocks/ 예시 데이터) |
| 내 PC 서버 + 가상 학생 로그인 | `EXPO_PUBLIC_USE_MOCK=0`, `EXPO_PUBLIC_DEV_LOGIN=1`, 서버 `.env`도 `DEV_AUTH=1` |
| 학교 이메일 로그인 | `EXPO_PUBLIC_DEV_LOGIN=0` + Supabase 값 채우기 |

휴대폰에서 내 PC 서버에 붙으려면 `EXPO_PUBLIC_API_URL`을 `localhost` 대신 PC의 IP로 바꿉니다.

**다른 와이파이·데이터로 휴대폰에서 보기 (예시 데이터 모드)**: `npx expo start --tunnel ngrok`
→ 뜨는 `https://…exp.direct` 주소를 휴대폰 인터넷 창에서 열면 웹으로 보이고, QR은 Expo Go 앱으로 찍으면 됩니다. PC가 켜져 있는 동안만 열립니다.

## 폴더

```
app/
├─ app/                  화면 (파일 하나 = 화면 하나, 화면 번호는 docs/기획/메뉴구성.md)
│  ├─ _layout.tsx        로그인 전: login만 / 로그인 후: (main) 화면들
│  ├─ login.tsx          M-1
│  └─ (main)/
│     ├─ index.tsx       홈 = 피그마 seokyeong_ui_home 1 (인사·캐릭터, 오늘 챙길 일 3개씩 넘겨 보기, 메뉴 4칸, 아래 질문창)
│     ├─ campus.tsx      캠퍼스 생활 (분실물 자리, 지금은 준비 중)
│     ├─ onboarding.tsx  M-2 처음 설정
│     ├─ todos/          T-1 목록, [id] T-2 상세, done T-3
│     ├─ notifications   T-4 알림 센터
│     ├─ study/          index L-1(졸업 | 시간표 = 시안 02 | 성적 = 시안 09), graduation L-2,
│     │                  timetable-edit 시안 03~08, grades-edit 시안 10, grade-edit 시안 11
│     ├─ scholarships/   index 시안 12 (+ 비서 판정), applications S-3
│     ├─ notices/[id]    시안 13 공지 상세 (AI 요약·판정·원문·신청 완료 체크)
│     ├─ office/         A-1 공지, calendar A-2, leave A-3
│     ├─ chat/           H-1·H-2 채팅, history H-3
│     └─ me/             index 시안 14, status 시안 15·16, assistant M-5
├─ components/ui.tsx     공통 부품: 카드, D-day 배지, 판정 배지, 출처, 로딩·오류·빈 화면, 알림창
├─ components/form.tsx   입력 부품: 드롭다운, 선택 버튼 묶음, 팝업(Sheet), 확인 창(Confirm)
├─ components/TimetableGrid.tsx · GradesView.tsx   시간표 표(시안 02), 성적 보기·수정(시안 09·10)
├─ lib/
│  ├─ api.ts             서버 부르기는 이 파일만 (토큰 자동 첨부, mock 전환, useApi 훅)
│  ├─ session.ts         로그인 상태 (Supabase 또는 가상 학생)
│  ├─ push.ts            푸시 등록, 알림 누르면 화면 이동
│  ├─ types.ts           서버 응답 모양 (API 명세와 같게)
│  ├─ config.ts · theme.ts
└─ mocks/                예시 데이터 (API 명세 예시와 같은 모양)
```

## 남은 일 (MVP 뼈대 이후)
- 디자인: 시안(`docs/디자인/`)에 맞춰 스타일 다듬기, 캐릭터 이미지(지금은 🐘 자리 표시)
- 푸시: `npx eas-cli@latest init`으로 projectId 만들기 → 개발 빌드(`eas build --profile development`)에서 확인. Expo Go·웹에서는 푸시가 안 옴
- 웹 링크: `npx expo export --platform web` → `dist/`를 정적 호스팅(Vercel 등)에 올리기
- 안드로이드 APK: `eas build -p android --profile preview`

Expo는 SDK마다 바뀌는 게 많습니다. 새 기능을 넣을 때는 `AGENTS.md`의 안내대로 SDK 58 문서를 먼저 확인하세요.
