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
| 3 | API 클라이언트·예시 데이터 | ✔🔧 | 예시 데이터 대폭 보강(공지 9개·학사일정 7개·대화 5개·분실물), **가상 학생 4명의 내 정보를 따로 저장**(로그아웃·새로고침해도 유지, 탈퇴하면 처음 설정부터), 시간표·성적 추가·삭제가 실제로 반영 | `lib/api.ts`, `mocks/index.ts` |
| 4 | 로그인 상태 관리 | ✔🔧 | localStorage가 막힌 환경(시크릿 창·임베드)에서도 앱이 안 멈추게 | `lib/session.ts` |
| 5 | 서버 푸시 | 🔧 | 앱이 꺼진 상태에서 알림으로 열 때 이동, 앱 사용 중 수신 시 홈 새로고침, `eas.json`·`expo-dev-client` 추가 | `lib/push.ts`, `eas.json` |
| 6 | 웹 링크·APK | ✅ | 시연 사이트 빌드(`npm run build:demo`), APK 빌드 명령(`npm run build:apk`), 웹용 앱 안 알림창(`DialogHost`) | `scripts/build-demo.mjs`, `app.config.js`, `package.json` |
| 7 | M-1 로그인 | 🔧 | 예시 데이터 모드에서 가상 학생마다 **지금 저장된 학년·학과**(탈퇴했으면 '탈퇴함')를 보여 줌 | `app/login.tsx` |
| 8 | M-2 처음 설정 | 🔧 | **부전공 입력** 추가, 알림 허용을 4단계로 분리, 진행 막대 | `app/(main)/onboarding.tsx` |
| 9 | M-3 마이페이지 | 🔧 | 계정 삭제 시 **경고 두 번**(두 번째: "정말 삭제하시겠습니까? 삭제하면 원래대로 되돌릴 수 없습니다") 후 삭제 → 로그인 화면 | `app/(main)/me/index.tsx` |
| 10 | M-4 학적 변경 | ✔ | (변경 없음) | `app/(main)/me/status.tsx` |
| 11 | M-5 AI 비서 설정 | 🔧 | **'비서가 볼 정보'**(학적·성적·시간표·이전 대화) 켜기·끄기 | `app/(main)/me/assistant.tsx` |
| 12 | 캐릭터 + 브리핑 | 🔧 | (2026-10-27 새 디자인) 홈 전체 배경을 받은 배경 그림(`home-bg.jpg`, 스크롤해도 고정)으로, 왼쪽 위 이름 **PREVI**, 마스코트 PREVI(미어캣, `mascot.png`)는 크게 두고 다리·꼬리는 카드 뒤로(책까지 보임), 인사말은 줄마다 글자 길이만큼만 뒤 배경을 흐리게(모서리 둥글게) 해서 가독성. **브리핑 말풍선은 요청으로 뺌** — 브리핑 문구(`GET /home`의 `briefing`)는 지금 홈에 안 보임. 오늘 챙길 일은 피그마 Today-Card처럼(색 점 + 둥근 D-day 배지, 달력 아이콘) | `app/(main)/index.tsx`, `components/ChatSheet.tsx`, `assets/home-bg.jpg`, `assets/mascot.png` |
| 13 | 오늘 챙길 일·다음 일정 | 🔧 | **다음 일정 카드**(피그마 홈 2쪽) → A-2, 웹에서 **마우스로 잡고 끌어 넘기기**·점 눌러 이동 | `app/(main)/index.tsx` |
| 14 | 메뉴 칸 + 비서 한 줄 | 🔧 | 칸마다 **`menu_status` 한 줄**, 기본 3칸 / 분실물 켜면 4칸 (`EXPO_PUBLIC_LOST_ENABLED`) | `app/(main)/index.tsx`, `lib/config.ts` |
| 15 | 질문창 + 추천 질문 | 🔧 | 아래 바를 **잡고 끌어 올리면 대화 화면이 따라 올라와서 그 자리에서 바로 대화**(앱은 손가락, 웹은 마우스), ↑ 화살표를 누르면 끝까지 올린 것과 같음, 머리줄을 내리거나 ⌄로 닫기. 홈의 추천 질문 칩은 뺌(대화 시작 화면에 추천 질문 있음) | `components/ChatSheet.tsx`, `app/(main)/index.tsx` |
| 16 | T-1 할 일 목록 | 🔧 | 종류 배지, 칩 필터 | `app/(main)/todos/index.tsx` |
| 17 | T-2 할 일 상세 | 🔧 | '완료했어요'를 누르면 **바로 들어오기 전 화면(할 일 목록·홈)으로 돌아가고 그 일이 목록에서 빠짐** | `app/(main)/todos/[id].tsx` |
| 18 | T-3 완료 기록 | ✔ | (변경 없음) | `app/(main)/todos/done.tsx` |
| 19 | T-4 알림 센터 | 🔧 | 종류 아이콘, **모두 읽음**, 누르면 바로 읽음 표시 | `app/(main)/notifications.tsx` |
| 20 | L-1 내 학업 | 🔧 | 졸업 탭 영역(전공 필수·선택, 교양 필수·선택)마다 ⌄를 누르면 **그 영역에서 들은 과목·성적·영역 평점**이 펼쳐짐 | `app/(main)/study/index.tsx`, `components/AreaCard.tsx` |
| 21 | L-2 졸업 요건 | 🔧 | 전체 진행 막대, 영역별 남은 학점(⌄로 들은 과목·성적 펼치기), **관련 마감** 목록 | `app/(main)/study/graduation.tsx`, `components/AreaCard.tsx` |
| 22 | L-3~L-7 시간표 | 🔧 | 과목 추가·빼기가 **바로 목록과 시간표 미리보기에 반영**되고 '변경사항 저장하기'로 서버에 저장(되돌리기 가능), 시간이 겹치거나 학점(21) 초과·중복이면 **추가하는 순간 등록 불가 창**, 과목 검색이 검색어로 걸러짐 | `study/timetable-edit.tsx`, `lib/schedule.ts`, `components/TimetableGrid.tsx` |
| 23 | L-8~L-10 성적 | 🔧 | 수정 모드에서 −를 누르면 **바로 지워지고**, 추가한 과목이 **바로 목록에 보임**, '수정 완료하기'는 추가·삭제 수와 **다시 계산한 졸업 학점**을 알려 줌. 이수 영역을 졸업 요건과 같은 4가지(전공 필수·선택, 교양 필수·선택)로 고름 | `study/grade-edit.tsx`, `study/grades-edit.tsx`, `components/GradesView.tsx` |
| 24 | S-1 장학금 | 🔧 | 카드에 **판정 근거** 표시 | `app/(main)/scholarships/index.tsx` |
| 25 | S-2 공지 상세 | ✔ | (변경 없음) | `app/(main)/notices/[id].tsx` |
| 26 | S-3 신청 내역 | 🔧 | **들어가는 길이 없던 문제** 해결('신청 완료' 칩·'신청 내역 전체 보기') | `scholarships/index.tsx`, `scholarships/applications.tsx` |
| 27 | A-1 나에게 해당하는 공지 | 🔧 | 분류 칩(학사·장학·수업·행사), **마감 지난 공지 숨김**/펼치기, 게시일 | `app/(main)/office/index.tsx` |
| 28 | A-2 학사 일정 | 🔧 | 목록 → **월 달력 + 날짜 누르면 그날 일정** | `app/(main)/office/calendar.tsx` |
| 29 | A-3 휴·복학 안내 | 🔧 | **장학금 영향** 카드, 규정 근거·장학 영향·복학 기간 질문 | `app/(main)/office/leave.tsx` |
| 30 | H-1 채팅 시작 | 🔧 | 피그마 ① 시작 화면(캐릭터, 아이콘 추천 질문). 대화 본문을 `ChatPanel`로 분리해서 채팅 화면과 홈 대화창이 같이 씀 | `components/ChatPanel.tsx`, `app/(main)/chat/index.tsx` |
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
| 성적 이수 영역 값 | `POST·PUT /grades`의 `area`를 `전공 필수`·`전공 선택`·`교양 필수`·`교양 선택` 4가지로 (명세 예시는 `전공`) | FE 23 |
| 영역별 들은 과목 | `GET /graduation`의 `areas[]`에 `courses: [{ term, course_name, credits, grade }]` (없으면 펼쳤을 때 '아직 없어요') | FE 20·21 |
| 대화 분류·미리보기 | `GET /conversations` 항목에 `category`, `preview` (없으면 앱이 제목으로 분류 추측) | FE 34 |
| 학적 맥락 | `POST /chat`의 `context.kind`에 `"status"` 추가 | FE 29·32 |
| 답변 평가 | 👍👎를 서버에 저장하려면 `PATCH /messages/{id} { feedback }` (지금은 앱 안에서만 표시) | FE 31 |
| 분실물 | `GET /lost-items?kind=found\|lost`, `?matched_for=me`, `GET /lost-items/{id}`, `POST /lost-items`, `POST /lost-items/analyze`, `GET /lost-items/{id}/questions`, `POST /lost-items/{id}/claim` | FE 35 |

## 직접 확인이 필요한 것 (이번에 확인 못 함)

- **한 학기 최대 학점(FE 22)**: 앱은 21학점으로 막고 있음(`lib/schedule.ts`의 `CREDIT_LIMIT`). 학칙 기준(학년·직전 평점에 따라 다른지)을 BE와 맞춰야 함

- **푸시(FE 5·33)**: 웹·Expo Go에서는 푸시가 오지 않음. `npx eas-cli@latest init`(Expo 계정 필요)으로 projectId를 만든 뒤 `npm run build:dev`로 개발 빌드를 깔아서 확인
- **APK(FE 6)**: `npm run build:apk` (Expo 계정 로그인 필요)
- **학교 이메일 로그인(FE 7)**: Supabase 주소·키를 `.env`에 넣어야 확인 가능
- **사진 선택(FE 35)**: 웹에서는 파일 선택 창, 휴대폰에서는 카메라·앨범. 실제 기기에서 한 번 확인 필요
- **실제 서버 연결**: 모든 화면은 예시 데이터로만 확인함. BE API가 나오면 `.env`에서 `EXPO_PUBLIC_USE_MOCK=0`으로 한 번씩 확인

## 참고

- 홈은 새 디자인(배경 `assets/home-bg.jpg` + 마스코트 PREVI `assets/mascot.png`, 아이콘 색은 피그마 '01_홈화면_1'처럼 칸마다 다른 색)입니다. 다른 화면(채팅 등)은 아직 예전 코끼리 캐릭터(`assets/character.png`, `character-face.png`)를 씁니다. 그림을 바꾸려면 같은 이름 파일만 바꾸면 됩니다.
- 새 패키지: `expo-image-picker`, `expo-image-manipulator`(분실물 사진), `expo-dev-client`(개발 빌드). 받은 뒤에는 `npm install`을 다시 해 주세요.
- 타입 검사(`npm run typecheck`)와 린트 모두 경고 0개로 통과합니다 (`require` 두 곳은 웹에서 안 불러오려는 의도라 이유를 적고 예외 처리).

## 기능·코드 점검 (2026-10-25)

시연 사이트에서 모든 화면(27개 주소)을 열고, 채팅·시간표·성적·할 일·학적 변경·분실 신고·장학금 신청 완료를 직접 눌러 확인했습니다. 찾은 문제와 고친 내용:

| 구분 | 문제 | 고친 내용 | 파일 |
|---|---|---|---|
| 보안 | 공지·할 일·채팅 답변의 링크를 검사 없이 열어서 `javascript:`·`intent:` 같은 주소도 열 수 있었음 | `http(s)`만 여는 `openLink`·`isSafeUrl` 한 곳으로 모음 (4곳) | `components/ui.tsx` 외 |
| 보안 | 로그인 전에도 `Authorization: Bearer null`을 서버로 보냄 | 토큰이 있을 때만 붙임 | `lib/api.ts` |
| 보안·오류 | 학교 이메일 로그인: Supabase 설정이 없으면 앱이 멈춤, 앞뒤 공백·대문자면 도메인 검사 실패, 버튼 연타로 인증 메일 여러 통 | 설정 확인 문구, 주소 정리(`trim`·소문자), 보내는 중 버튼 막기 | `app/login.tsx` |
| 오류 | 검색어를 빨리 바꾸면 늦게 온 예전 결과가 새 결과를 덮을 수 있음 | `useApi`가 마지막 요청 결과만 반영 | `lib/api.ts` |
| 오류 | 지난 마감이 `D--30`으로 보임 | `마감 지남 (9/25(금))` | `lib/format.ts` |
| 오류 | 없는 공지 번호를 열면 다른 공지가 보임, 없는 할 일은 '아직 없어요' | 예시 데이터도 서버처럼 404 → '찾을 수 없어요' | `mocks/index.ts` |
| 오류 | 알림의 `target_id`가 비어 있으면 `/notices/null`로 이동 | 목록 화면으로 이동 | `lib/push.ts` |
| 오류 | 알림 설정·비서 설정·대화 고정·신청 완료 체크·휴학 할 일 등록·학적 변경이 실패하면 조용히 멈춤(처리 안 된 오류) | 실패하면 알림창 (`attempt`) | 6개 화면 |
| 오류 | 시간표 저장 중 네트워크 오류도 '수강 과목 등록 불가' 창으로 보임 | 409(겹침·학점 초과)만 그 창, 나머지는 일반 알림 | `study/timetable-edit.tsx` |
| 기능 | 채팅의 '마감 알림 받기'를 두 번 누르면 같은 할 일이 두 개 | 한 번 누르면 '✓ 할 일에 등록됨'으로 바뀜 | `components/ChatPanel.tsx` |
| 기능 | 분실 신고·습득물 제보·수령 신청·성적 저장을 빠르게 두 번 누르면 두 번 등록 | 보내는 중 버튼 막기 (`useSubmit`), 공백만 입력하면 막기 | `lost/*`, `study/grade-edit.tsx` |
| 기능 | 시간표 과목 검색에서 겹치는 과목을 고르면 창이 닫히고 검색어도 사라짐 | 등록 불가 창을 닫으면 검색 창으로 돌아가고 검색어 유지 | `study/timetable-edit.tsx` |
| 성능 | 과목 검색이 글자마다 서버 호출 | 입력이 0.3초 멈추면 검색 | `study/timetable-edit.tsx` |
| 성능 | 목록 비교를 이중 반복(n×m)으로 함 | `Set`으로 한 번에 (시간표 변경 비교, 성적 추가·삭제 수, 검색 결과 '담음' 표시) | `timetable-edit.tsx`, `GradesView.tsx` |
| 중복 | 학과·부전공·학적 목록, 브리핑 시각, 요일 배열이 여러 파일에 똑같이 있음 | `lib/constants.ts` 한 곳으로 | 8개 파일 |
| 중복 | `ApiError`를 쓰려고 예시 데이터에서 `api.ts`를 매번 동적으로 불러옴 | `lib/errors.ts`로 분리해서 바로 불러옴 | `lib/errors.ts`, `mocks/index.ts` |
| 린트 | 학적 변경 화면이 effect 안에서 상태를 고침 (`set-state-in-effect`, 의존성 누락) | 서버 값에서 바로 계산하고 고칠 때만 따로 저장 | `me/status.tsx` |

남은 것 (이번에 안 고침, 판단 필요):

- **휴대폰의 로그인 토큰 저장**: 지금은 `expo-sqlite`의 localStorage(암호화 안 됨)에 저장. 실제 배포 전에는 `expo-secure-store`로 바꾸는 것을 권장 (패키지 추가 필요)
- **'학사 일정' 알림**: 눌러도 달력 첫 화면으로만 감 (어느 일정인지 `target_id`를 달력에 넘기려면 달력 화면에 날짜 선택 인자 추가 필요)
- **채팅 '마감 알림 받기'의 할 일 종류**: 항상 `deadline`으로 등록. 명세의 `add_todo` payload에 `type`이 없어서 그대로 둠 (조장 확인)
- 작업 규칙 1번(카드 하나 = PR 하나)대로 올리려면 이 브랜치를 기준으로 카드별로 나눠 올리면 됩니다. 파일마다 `▶ FE n번` 표시가 있어서 나누기 쉽습니다.
