# FE 구현 정리 (브랜치 `fe/complete-mvp`)

작성일: 2026-10-24 · 기준: `mvp` 브랜치 + 작업 보드 FE 1~35번 + 피그마 `디자인 예시`(홈·채팅 시안)

코드에서 각 부분이 보드의 몇 번 카드인지 찾으려면 **`▶ FE`** 로 검색하세요.
예: `// ▶ FE 13번에 해당하는 부분: 다음 일정 카드 → A-2`

## 시연 사이트

| 방법 | 내용 |
|---|---|
| 링크 | https://claude.ai/artifact/KSy1QoVa8q13N759se35Pp (지금은 만든 사람만 열림 → 페이지 오른쪽 위 Share에서 팀원에게 공유) |
| 내 PC | `../demo/시연_사이트_열기.bat` 더블클릭 → http://localhost:8095 (파이썬 또는 Node 필요, 인터넷 없이 됨) |
| 다시 만들기 | `cd app` → `npm run build:demo` → `../demo/index.html` 새로 생성 |

예시 데이터 모드라 서버 없이 모든 화면이 돌아갑니다. 가상 학생 4명 중 골라 로그인 (홍길동 = 4학년, 졸업 관련 할 일이 보임).

## 항목별 정리

✅ 이번에 완성 · 🔧 이번에 고침/보강 · ✔ 원래 있던 것 (FE 표시만 붙임)

| FE | 화면 | 상태 | 바뀐 내용 | 파일 |
|---|---|---|---|---|
| 1 | 내비게이션 | ✔🔧 | 필터 칩 공통 부품(`Chips`), 웹에서 휴대폰 폭으로 가운데 표시 | `app/_layout.tsx`, `app/(main)/_layout.tsx`, `app/(main)/index.tsx` |
| 2 | 공통 컴포넌트 | 🔧 | **사진·제목·설명 2줄·링크 카드(`ItemCard`)** 추가, 캐릭터·'답변 작성 중' 부품 | `components/ui.tsx` |
| 3 | API 클라이언트·예시 데이터 | ✔🔧 | 예시 데이터 대폭 보강(공지 9개·학사일정 7개·대화 5개·분실물), 가상 학생별 이름·학년 반영 | `lib/api.ts`, `mocks/index.ts` |
| 4 | 로그인 상태 관리 | ✔🔧 | localStorage가 막힌 환경(시크릿 창·임베드)에서도 앱이 안 멈추게 | `lib/session.ts` |
| 5 | 서버 푸시 | 🔧 | 앱이 꺼진 상태에서 알림으로 열 때 이동, 앱 사용 중 수신 시 홈 새로고침, `eas.json`·`expo-dev-client` 추가 | `lib/push.ts`, `eas.json` |
| 6 | 웹 링크·APK | ✅ | 시연 사이트 빌드(`npm run build:demo`), APK 빌드 명령(`npm run build:apk`), 웹용 앱 안 알림창(`DialogHost`) | `scripts/build-demo.mjs`, `app.config.js`, `package.json` |
| 7 | M-1 로그인 | ✔ | (변경 없음) | `app/login.tsx` |
| 8 | M-2 처음 설정 | 🔧 | **부전공 입력** 추가, 알림 허용을 4단계로 분리, 진행 막대 | `app/(main)/onboarding.tsx` |
| 9 | M-3 마이페이지 | ✔ | (변경 없음) | `app/(main)/me/index.tsx` |
| 10 | M-4 학적 변경 | ✔ | (변경 없음) | `app/(main)/me/status.tsx` |
| 11 | M-5 AI 비서 설정 | 🔧 | **'비서가 볼 정보'**(학적·성적·시간표·이전 대화) 켜기·끄기 | `app/(main)/me/assistant.tsx` |
| 12 | 캐릭터 + 브리핑 | 🔧 | 🐘 자리에 **피그마 코끼리 이미지**, 브리핑 문장을 말풍선 안으로, 누르면 채팅 | `app/(main)/index.tsx`, `assets/character*.png` |
| 13 | 오늘 챙길 일·다음 일정 | 🔧 | **다음 일정 카드**(피그마 홈 2쪽) → A-2 | `app/(main)/index.tsx` |
| 14 | 메뉴 칸 + 비서 한 줄 | 🔧 | 칸마다 **`menu_status` 한 줄**, 기본 3칸 / 분실물 켜면 4칸 (`EXPO_PUBLIC_LOST_ENABLED`) | `app/(main)/index.tsx`, `lib/config.ts` |
| 15 | 질문창 + 추천 질문 | 🔧 | 피그마처럼 추천 질문 3개를 질문창 아래로 | `app/(main)/index.tsx` |
| 16 | T-1 할 일 목록 | 🔧 | 종류 배지, 칩 필터 | `app/(main)/todos/index.tsx` |
| 17 | T-2 할 일 상세 | ✔ | (변경 없음) | `app/(main)/todos/[id].tsx` |
| 18 | T-3 완료 기록 | ✔ | (변경 없음) | `app/(main)/todos/done.tsx` |
| 19 | T-4 알림 센터 | 🔧 | 종류 아이콘, **모두 읽음**, 누르면 바로 읽음 표시 | `app/(main)/notifications.tsx` |
| 20 | L-1 내 학업 | ✔ | (변경 없음) | `app/(main)/study/index.tsx` |
| 21 | L-2 졸업 요건 | 🔧 | 전체 진행 막대, 영역별 남은 학점, **관련 마감** 목록 | `app/(main)/study/graduation.tsx` |
| 22 | L-3~L-7 시간표 | ✔ | (변경 없음) | `study/timetable-edit.tsx`, `components/TimetableGrid.tsx` |
| 23 | L-8~L-10 성적 | ✔ | (변경 없음) | `study/grade-edit.tsx`, `study/grades-edit.tsx`, `components/GradesView.tsx` |
| 24 | S-1 장학금 | 🔧 | 카드에 **판정 근거** 표시 | `app/(main)/scholarships/index.tsx` |
| 25 | S-2 공지 상세 | ✔ | (변경 없음) | `app/(main)/notices/[id].tsx` |
| 26 | S-3 신청 내역 | 🔧 | **들어가는 길이 없던 문제** 해결('신청 완료' 칩·'신청 내역 전체 보기') | `scholarships/index.tsx`, `scholarships/applications.tsx` |
| 27 | A-1 나에게 해당하는 공지 | 🔧 | 분류 칩(학사·장학·수업·행사), **마감 지난 공지 숨김**/펼치기, 게시일 | `app/(main)/office/index.tsx` |
| 28 | A-2 학사 일정 | 🔧 | 목록 → **월 달력 + 날짜 누르면 그날 일정** | `app/(main)/office/calendar.tsx` |
| 29 | A-3 휴·복학 안내 | 🔧 | **장학금 영향** 카드, 규정 근거·장학 영향·복학 기간 질문 | `app/(main)/office/leave.tsx` |
| 30 | H-1 채팅 시작 | 🔧 | 피그마 ① 시작 화면(캐릭터, 아이콘 추천 질문) | `app/(main)/chat/index.tsx` |
| 31 | H-2 답변 | 🔧 | 피그마 ② 졸업 요건 카드(진행 막대·체크 목록), 아바타 말풍선, 첫 버튼 강조, 👍👎, 움직이는 '답변 작성 중' | `chat/index.tsx`, `components/ui.tsx`(InfoCard·TypingDots) |
| 32 | 맥락 이어받기 | 🔧 | A-3에서도 맥락(`context.kind = 'status'`) 넘김 | `office/leave.tsx`, `chat/index.tsx` |
| 33 | 답변 도착 푸시 | ✔ | 앱 쪽 처리(알림 누르면 그 대화 열기)는 원래 있음. 발송은 BE | `lib/push.ts`, `chat/index.tsx` |
| 34 | H-3 대화 목록 | 🔧 | 피그마 ⑤ **분류 칩**·아이콘·날짜·미리보기, 고정한 대화 위로, 검색 0.3초 지연 | `app/(main)/chat/history.tsx` |
| 35 | C 분실물 | ✅ | C-1 센터(탭·AI 매칭 배너), C-2 습득물 제보(사진 → 1024px 축소 → AI 초안), C-3 분실 신고, C-4 상세(매칭 근거·찾아가는 법), C-5 수령 신청(본인 확인 질문) | `campus.tsx`, `lost/*`, `lib/photo.ts` |

## 조장 확인이 필요한 것 (API 명세에 없는 것)

작업 규칙 6번에 따라 `docs/04_API_명세.md`를 먼저 고쳐야 하는 항목입니다. 앱은 서버가 아직 안 줘도 깨지지 않게 만들어 두었습니다.

| 항목 | 앱이 보내거나 기대하는 모양 | 쓰는 곳 |
|---|---|---|
| 비서가 볼 정보 | `GET·PUT /me`에 `assistant_scope: { grades, timetable, status, chat_history }` (없으면 전부 켠 것으로 봄) | FE 11 |
| 대화 분류·미리보기 | `GET /conversations` 항목에 `category`, `preview` (없으면 앱이 제목으로 분류 추측) | FE 34 |
| 학적 맥락 | `POST /chat`의 `context.kind`에 `"status"` 추가 | FE 29·32 |
| 답변 평가 | 👍👎를 서버에 저장하려면 `PATCH /messages/{id} { feedback }` (지금은 앱 안에서만 표시) | FE 31 |
| 분실물 | `GET /lost-items?kind=found\|lost`, `?matched_for=me`, `GET /lost-items/{id}`, `POST /lost-items`, `POST /lost-items/analyze`, `GET /lost-items/{id}/questions`, `POST /lost-items/{id}/claim` | FE 35 |

## 직접 확인이 필요한 것 (이번에 확인 못 함)

- **푸시(FE 5·33)**: 웹·Expo Go에서는 푸시가 오지 않음. `npx eas-cli@latest init`(Expo 계정 필요)으로 projectId를 만든 뒤 `npm run build:dev`로 개발 빌드를 깔아서 확인
- **APK(FE 6)**: `npm run build:apk` (Expo 계정 로그인 필요)
- **학교 이메일 로그인(FE 7)**: Supabase 주소·키를 `.env`에 넣어야 확인 가능
- **사진 선택(FE 35)**: 웹에서는 파일 선택 창, 휴대폰에서는 카메라·앨범. 실제 기기에서 한 번 확인 필요
- **실제 서버 연결**: 모든 화면은 예시 데이터로만 확인함. BE API가 나오면 `.env`에서 `EXPO_PUBLIC_USE_MOCK=0`으로 한 번씩 확인

## 참고

- 캐릭터 이미지(`assets/character.png`, `character-face.png`)는 피그마 홈 시안 화면에서 잘라낸 임시 이미지입니다. 디자이너에게 배경이 투명한 PNG를 받으면 같은 이름으로 바꾸기만 하면 됩니다.
- 새 패키지: `expo-image-picker`, `expo-image-manipulator`(분실물 사진), `expo-dev-client`(개발 빌드). 받은 뒤에는 `npm install`을 다시 해 주세요.
- 타입 검사(`npm run typecheck`)는 통과합니다. 린트에서 남은 경고 4개는 원래 코드(`me/status.tsx`, `lib/push.ts`, `lib/session.ts`의 `require`)에 있던 것입니다.
- 작업 규칙 1번(카드 하나 = PR 하나)대로 올리려면 이 브랜치를 기준으로 카드별로 나눠 올리면 됩니다. 파일마다 `▶ FE n번` 표시가 있어서 나누기 쉽습니다.
