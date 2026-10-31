# FE 구현 정리 (브랜치 `fe/complete-mvp`)

작성일: 2026-10-24 · 기준: `mvp` 브랜치 + 작업 보드 FE 1~35번 + 피그마 `디자인 예시`(홈·채팅 시안)

코드에서 각 부분이 보드의 몇 번 카드인지 찾으려면 **`▶ FE`** 로 검색하세요.
예: `// ▶ FE 13번에 해당하는 부분: 다음 일정 카드 → A-2`

## 시연 사이트

| 방법 | 내용 |
|---|---|
| 링크 | https://claude.ai/artifact/KSy1QoVa8q13N759se35Pp (링크가 있는 사람 모두 열람 가능) |
| 내 PC | `../demo/시연_사이트_열기.bat` 더블클릭 → http://localhost:8095 (파이썬 또는 Node 필요, 인터넷 없이 됨) |
| 다시 만들기 | `cd app` → `npm run build:demo` → `../demo/index.html` 새로 생성 |

예시 데이터 모드라 서버 없이 모든 화면이 돌아갑니다. 로그인 화면의 '시연용 계정 보기'에서 가상 학생 4명 중 골라 로그인 (비밀번호 1234, 홍길동 20210004 = 4학년, 졸업 관련 할 일이 보임). 회원가입도 해 볼 수 있음 (인증번호는 메일 대신 화면에 알려 줌).

## 실제 서버 연결·제출 준비 (2026-10-28)

서버 기준 브랜치: **`통합본`** (10/28 23:57에 `be/demo-accounts`·`be/account-deletion`·`be/notice-pipeline` 합침, 앱 코드는 `fe/mvp3`와 같음). ☑ 끝 · ◐ 일부 · ☐ 남음

### 1. 진짜 서버로 바꾸기 — ◐ (Supabase 두 칸만 채우면 끝)
- ☑ `app/.env` 만듦 (깃허브에 안 올라감): `USE_MOCK=0`, `DEV_LOGIN=0`, `EMAIL_DOMAIN=skuniv.ac.kr`. `.env.example`도 같은 기본값으로
- ☐ `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` 채우기 = 팀 단톡방 공지의 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (공개 키. `SUPABASE_SECRET_KEY`는 앱에 넣지 않기)
- ☐ 휴대폰·APK로 볼 때 `EXPO_PUBLIC_API_URL`을 PC IP 또는 서버 공개 주소(BE B G7 Cloudflare Tunnel)로
- 로그인 방식은 서버와 맞음: 시연 계정이 `학번@skuniv.ac.kr`(`server/scripts/create_demo_accounts.py`) → 앱에 학번만 쳐도 됨. **시연 계정 비밀번호는 무작위**라 만든 사람(조장)에게 받기 (`1234` 아님, `시연 로그인 정보.txt`는 깃에 안 올라감)
- ☑ 서버와 안 맞던 것 앱에서 고침
  - 처음 쓰는 학생: 서버는 `404 PROFILE_NOT_FOUND`, 명세·앱은 `NO_PROFILE` → 앱이 둘 다 받아서 처음 설정으로 보냄 (`app/(main)/_layout.tsx`)
  - 회원가입 때 적은 이름이 내 정보에 안 들어감 → 처음 설정 저장할 때 `nickname`으로 같이 보냄 (`onboarding.tsx`, `lib/auth.ts`의 `signupName`)

### 2. 화면 전체 점검 — ☐ (BE A 1번이 끝나야 함)
시연 계정으로 로그인 → 아래 순서로 서버 응답과 화면 비교. 앱이 부르는 주소 26개가 `통합본` 서버에 모두 있음 (계정 삭제 `DELETE /me`도 합쳐짐, 204로 응답 → 앱 처리 OK)

| 화면 | 확인할 것 | 미리 본 서버 차이 |
|---|---|---|
| 홈 | 인사말 이름, 종 빨간 점, 오늘 챙길 일 9개·다음 일정, 메뉴 칸 한 줄 3개 | **`GET /home`에 `nickname`·`unread_notifications`가 없음**(명세에는 있음) → 지금은 "서경인님", 빨간 점 안 뜸. BE A에 요청 |
| 할 일 | 목록·필터·상세·완료 → 완료 기록 | |
| 내 학업 | 졸업 남은 학점·영역별 과목, 시간표 추가·겹침 막기·저장, 성적 추가·수정·삭제 → 졸업 학점 다시 계산 | 성적 `area` 4가지 값 (아래 조장 확인 표) |
| 장학 | 판정 배지, 장학금 안내 → 신청 완료 체크 → 신청 내역 | |
| 채팅 | 추천 질문, 답변 카드·출처·버튼, 할 일 등록, 대화 기록 | |
| 마이 | 학적 변경(휴학 → 휴·복학 안내), 알림 시각·방해 금지 시간 저장, 비밀번호 변경, 로그아웃, 계정 삭제 | 계정 삭제는 서버 `.env`에 `SUPABASE_SECRET_KEY`가 있어야 됨 (없으면 503) |

### 3. 푸시 받기 — ☐ (Expo 계정·안드로이드 폰 필요)
1. `cd app` → `npx eas-cli@latest login` → `npx eas-cli@latest init` (projectId가 `app.json`에 들어감. 없으면 앱이 푸시 등록을 건너뜀)
2. EAS에 값 넣기 (클라우드 빌드는 `app/.env`를 안 읽음 → `eas.json`의 `environment`가 이 값을 씀):
   `npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_URL --value <주소> --environment development --visibility plaintext`
   (같은 식으로 `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`. APK용은 `--environment preview`로 한 번 더)
3. `npm run build:dev` → 폰에 설치 → 로그인하면 알림 권한 → 토큰이 `PUT /me {push_token}`으로 저장되는지 (Supabase `profiles` 표)
4. 서버 `.env`의 `PUSH_ENABLED=true`, `EXPO_ACCESS_TOKEN` (BE) → 알림을 눌러 공지·할 일·학사일정 화면으로 가는지
- 서버 푸시 모양은 앱과 맞음: `data: { type, title, target_id }`, 종류 notice·deadline·calendar → 공지·할 일·학사일정 화면. 방해 금지 시간(`notify_quiet`)·알림 시각(`notify_time`)도 서버가 지킴 (`server/jobs/pipeline.py`)
- 참고: 팀 결정(10/27)으로 '답변 도착' 푸시는 안 보냄. 앱의 `chat` 알림 처리·M-5 '답변 도착' 켜기는 조장 확인 후 뺄지 정하기

### 4. 제출용 빌드 — ◐ (10/31 갱신: 웹·관리자 웹·APK 완료, 서버 적용 뒤 폰 점검 남음)
주소는 모두 10/31 직접 열어서 확인함

- ☑ **서버 고정 주소**: https://amused-swirl-reprocess.ngrok-free.dev (`/health` 정상). 앱·관리자 웹은 ngrok 주소면 안내 화면을 건너뛰는 헤더를 자동으로 붙임. 서버 CORS는 모든 주소 허용
- ☑ **`.env`·EAS 값** (깃에 안 올라감. 서버 전용 키 `SUPABASE_SECRET_KEY`는 절대 넣지 않기)
  - `app/.env`: `EXPO_PUBLIC_API_URL`(위 주소), `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`(공개 키)
  - EAS `preview` 환경에 같은 세 값 등록 (APK 빌드가 씀. 클라우드 빌드는 `app/.env`를 안 읽음)
- ☑ **학생 웹(고정 주소)**: https://previ-skuniv.pages.dev — `통합본`에 `app/` 변경이 올라오면 GitHub Actions(`.github/workflows/deploy-web.yml`)가 자동 배포. 처음 생각한 `previ.pages.dev`는 다른 사람의 스팸 사이트라 쓰지 않음
  - `npm run export:web`은 끝에 `scripts/fix-web-assets.mjs`를 돌림: Cloudflare Pages가 `node_modules` 폴더를 안 올려서 아이콘 글꼴이 ☒로 깨지던 문제(10/30) 해결
- ☑ **관리자 웹**: https://previ-admin.pages.dev (BE가 배포. 관리자 로그인은 서버 `ADMIN_EMAILS`의 학교 메일만, `012_admin.sql` 적용됨)
- ☑ **안드로이드 APK**: EAS `kaluso71s-team/seokyeong-ai-secretary`, `npm run build:apk`(preview 프로필, 실서버·Supabase 로그인). 빌드 목록·내려받기는 expo.dev 프로젝트 Builds (Expo 로그인 필요)
  - **옛 APK 쓰지 말 것**: 10/31 `expo-document-picker`(성적증명서), `react-native-view-shot`(습득물 사진 가리기) 같은 네이티브 패키지가 추가돼서 그 전 APK에서는 해당 기능이 안 됨. 항상 가장 최근 빌드로
  - 새 네이티브 패키지는 `npx expo install`로 넣고 APK를 다시 빌드 (JS만 바뀌어도 APK는 다시 빌드해야 반영됨)
- ☐ **서버 적용 확인 (BE)**: A13 배포(`014_profile_scholarship_info.sql` 적용, 서버 pull·재시작, 사진 글자 읽기 모델)가 끝나야 채팅 '저장하기'(토익·소득·거주지)와 성적증명서 읽기가 됨. 적용 전엔 '저장하지 못했어요' 창이 뜸
- ☐ **실제 폰 시연 흐름 점검** (서버 적용 뒤, 최신 APK로): 로그인 → 홈(오늘 챙길 일 제목 …·›) → 할 일 → 장학 → 채팅(답변 카드·되묻기·저장하기) → 학적 정보 변경(선택 정보) → 성적증명서 올리기 → 습득물 올리기(자르기·검은 상자 가리기·확인 체크)
- ☐ **폰 푸시 알림**: 서버 `PUSH_ENABLED=false`, Firebase(FCM) 키 미등록 → 지금은 앱 안 알림만. 폰 푸시를 시연하려면 FCM 키를 EAS에 올리고 BE가 켠 뒤 APK 다시 빌드
- 서버 주소가 바뀌면: `app/.env`·EAS 값 고치기 → 학생 웹은 `통합본` 반영 시 자동 재배포, APK는 다시 빌드

## 점검 13·14번 (2026-10-29)

- **13 졸업 영역별 과목 목록**: 서버 `GET /graduation`이 영역별 `courses`(+ 이번 학기 `taking`)를 줌 → `components/AreaCard.tsx`가 펼쳐서 보여 줌. 내 학업·졸업 요건 화면 둘 다 (처음엔 앱이 성적 목록으로 나눴지만, 서버가 주게 돼서 뺌)
- **14 졸업 정보 실패 때**: 졸업 기준이 없는 학과·입학연도(서버 `404 GRADUATION_RULES_NOT_FOUND`)여도 내 학업 화면의 **시간표·성적 조회 칸은 그대로**, 졸업 칸만 "적용 교육과정 확인 필요 + 소속·입학연도" 안내 (`study/index.tsx`)
- 예시 데이터도 서버처럼 맞춤: 기준 없는 학과면 404 (`mocks/index.ts`)

## 입학연도별 학과 선택 (2026-10-29)

근거: `docs/legacy-department-catalog` 브랜치 `supabase/research/학과개편_이전학과_선택목록_20261029.md` · `department_catalog_history.json`

- 목록 = 현재 학과·전공 44개(2026 요람 + 계속 있는 학부 세부전공) + 개편 전 학과·전공 23개(2025 개편 직전 학과 + 2023 통합 전 컴퓨터공학과·전자공학과). PR #6 '범위 정정'대로 컴퓨터과학과 등 오래된 변경 명칭 15개는 뺌(이미 저장된 값은 그대로 보임). 이름으로 중복 제거 → `lib/departments.ts`
- 고르는 창(`components/DeptPicker.tsx`): [현재 학과·전공 | 개편 전 학과·전공] 탭 + 검색. **입학연도는 추천 정렬에만**(그 학번에 맞는 학과를 위로 + '추천'), 막지 않음(편입·재입학·전과·복학). 처음 탭은 지금 값이 있는 쪽, 없으면 2025학번부터 현재·그 전은 개편 전
- 처음 설정: 입학년도를 학과보다 먼저 받음(2015~2026), 학과를 고르기 전에는 '다음' 안 됨. 학적 정보 변경: 내 정보의 입학연도로 추천
- 복수/부전공: [없음 | 복수전공 | 부전공] + 같은 고르기 창. 저장 값은 기존과 같은 '학과 (부전공)'
- 문서대로 하지 않은 것: 학과 이름으로 졸업 기준을 자동 연결하지 않음(서버 몫). 문서의 '새 필드·API'(입학 당시 학과·적용 교육과정)는 팀 합의 전이라 안 만듦

## 점검 목록 반영 3차 (2026-10-29)

| 번호 | 내용 | 고친 것 |
|---|---|---|
| 1 | 학과 가나다순 | 주전공·복수/부전공 목록을 가나다순(영문 학과는 끝)으로. 기기마다 정렬이 다르지 않게 정렬한 채로 적어 둠 |
| 2 | 복수/부전공 직접 입력 남아 있음 | 뺌 → 목록에서만 고름 (처음 설정·학적 변경) |
| 3 | 새 대화 | 대화창 머리줄 ⏱ 옆 ✎ → 새 대화(시작 화면·추천 질문) |
| 4 | 방해 금지 시간 | 미리 정한 시간 목록 뺌 → '끔', '직접 입력'만 |
| 5 | 묻기가 전체 화면으로 감 | 할 일 '채팅으로 묻기'·공지 '프리비에게 묻기'·휴복학 질문 → **그 화면 위로 올리고 내리는 대화창**. 답변 버튼으로 다른 화면에 가면 창이 내려감. 따로 있던 채팅·대화 기록 화면(`chat/index`, `chat/history`)은 지움 |
| 6 | 할 일 '마감' 필터 | 필터에서 '마감' 뺌(전체·장학·졸업·학적), 일반 할 일(deadline)은 종류 배지 없이 '전체'에서만 |

## 점검 목록 반영 2차 (2026-10-29)

| 번호 | 내용 | 고친 것 | 파일 |
|---|---|---|---|
| 1 | 복수/부전공 직접 입력 | 처음 설정·학적 정보 변경 모두 복수/부전공 목록 + **'직접 입력'**(고르면 입력칸) | `components/form.tsx`(MinorSelect) |
| 2 | 홈 '프리비' → 'PREVI' | 홈 인사·도움 문구, 아래 질문 바 | `app/(main)/index.tsx`, `components/ChatSheet.tsx` |
| 3 | 방해 금지 시간 직접 입력 | 목록 끝 '직접 입력' → 시작·끝 시각(30분 단위) 고르는 창 | `me/index.tsx`, `lib/constants.ts` |
| 4 | 처음 설정의 '성적은 나중에 입력해도 돼요' | 단계째 뺌 → 학적 → 동의 → 알림 (3단계) | `onboarding.tsx` |
| 5 | 화면 머리줄 비율 | ‹ 26→30, 제목 19→22, 흰 판을 조금 아래로 | `components/ui.tsx` |
| 6 | '마감 알림 받기'가 다른 일을 넣음 | 버튼에 넣을 일 이름을 같이 보여 줌("마감 알림 받기 · 2027-1학기 휴학 신청"), 등록 창에 이름·마감일. 예시 데이터는 휴학을 물으면 휴학 신청을 넣게(전에는 늘 복학). **실제 서버**는 `chat.py`의 `_calendar_action`이 질문과 비슷한 학사일정을 골라 넣으니 BE A가 고르는 기준 확인 필요 | `ChatPanel.tsx`, `mocks/index.ts` |
| 7 | 학과 선택만, 학과 더 많이 | 주전공 '직접 입력' 뺌, 목록 = 2026 대학요람 '대학별 교육과정'의 학과·학부·전공 32개 + 소프트웨어학과·전자컴퓨터공학과(졸업 요건이 계산되는 기존 학과). 처음 설정도 같은 목록(드롭다운) | `lib/constants.ts`, `onboarding.tsx`, `me/status.tsx` |
| 8 | 대화 기록도 올리고 내리는 창 | 홈 대화창의 ⏱ → 창 안에서 대화 기록, 고른 대화도 창 안에서 이어서 봄(‹로 돌아감). 다른 화면의 '채팅으로 묻기'는 기존 채팅 화면 | `components/ChatSheet.tsx`, `components/ChatHistory.tsx` |

## 점검 목록 반영 (2026-10-29)

| 번호 | 내용 | 고친 것 | 파일 |
|---|---|---|---|
| 1 | 홈 이름이 "서경인"으로 고정 | 서버 `/home`에 `nickname`이 없으면 `/me`에서 이름을 가져옴(안 읽은 알림 점도 `/notifications`로). 회원가입 이름은 처음 설정에서 저장(fe/mvp4). 시연 계정 이름은 `seed_personas.py`가 넣음 | `app/(main)/index.tsx` |
| 4 | 화면마다 글꼴이 다름 | 모든 글자·입력칸을 Noto Sans KR 하나로 (웹). 휴대폰은 기기 기본 글꼴 | `components/Text.tsx` |
| 5 | 공지 상세 AI 요약 위치 | AI 핵심 요약을 [학사]·[장학] 공지 칸 안(제목 아래)으로 | `notices/[id].tsx` |
| 7 | 장학금 두 버튼 동작이 다름 | 둘 다 '그 장학금만 보기'(다시 누르면 전체). 신청 완료를 고르면 아래 '신청 내역 자세히 보기' | `scholarships/index.tsx` |
| 10-가 | 답 기다리다 나가면 답이 사라짐 | 대화를 화면 밖(`lib/chatStore.ts`)에 보관 → 나가도 요청이 끝까지 가고 돌아오면 답이 보임. 홈 대화창·채팅 화면이 같은 대화 | `lib/chatStore.ts`, `components/ChatPanel.tsx` |
| 10-나 | "마감 알림 받기" 오류 | `POST /todos`에 `source` 빼고 보냄. **휴·복학 안내 '할 일로 등록'도 같은 오류**(source calendar)라 같이 고침 | `ChatPanel.tsx`, `office/leave.tsx` |
| 11 | 다크 모드가 어색함 | 다크 모드 뺌 (색 뒤집기 방식이라 사진·그림자가 이상함). 다크용 색 묶음을 만들 때 다시 넣기 | `lib/display.ts`, `me/index.tsx` |
| 12 | "서경 AI" → "프리비" | 홈 인사·도움 문구, 아래 질문 바, 로그인 안내, 대화 시작 문구, 학적 변경 안내, 공지 "프리비에게 묻기". 로고·대화 제목 PREVI와 앱 이름 "서경 AI 비서"는 그대로 | 여러 화면 |
| 16 | AI 비서 설정의 알림 시간 중복 | "마감 알림 받을 시간" 뺌 (마이페이지 '마감 임박 및 브리핑 알림'만) | `me/assistant.tsx` |
| 17 | 비밀번호 안내가 영어 | Supabase 영어 오류를 한국어로 바꿔 보여 줌(비밀번호 길이·쉬운 비밀번호·이미 가입·요청 많음·인증번호 만료 등). 비밀번호 최소 길이를 Supabase 기본값 **6자**로 맞춤(4자로 안내하면 서버가 영어로 거절) | `lib/auth.ts`, `signup.tsx`, `me/index.tsx` |
| 18 | 개인정보 처리방침 정렬 | 가운데 정렬 알림창 → 항목 제목 + 한 줄에 하나씩 보이는 창 | `components/form.tsx`(LegalSheet), `lib/legal.ts` |
| 9 | 학과가 2개뿐 | 처음 설정·학적 정보 변경에 **'직접 입력'** 추가 (목록에 없는 학과는 졸업 요건 기준이 없어 '확인 필요'로 보일 수 있음) | `onboarding.tsx`, `me/status.tsx`, `lib/constants.ts` |
| 6 | 마감 아닌 일에 "마감" | **안 고침(설명만)**: 배지는 할 일 `type`. 서버(`jobs/pipeline.py`)가 공지로 할 일을 만들 때 장학 공지 → `scholarship`(장학), **학사 공지 중 마감일이 있는 것 → 모두 `deadline`(마감)**. 직접·채팅으로 등록한 일도 기본 `deadline`. 바꾸려면 BE가 종류를 나누거나 FE가 이름을 '학사'로 |

추가로 찾아 고친 오류 (통합본 서버와 비교)
- 장학금 내역: 서버가 `applied_at`(신청일)을 안 줘서 **신청 완료 카드에서 화면이 멈춤** → 날짜 없으면 "신청 완료"만
- 신청 내역: 서버가 장학금 이름을 안 줌 → 장학금 목록에서 이름을 찾아 붙임
- 학사 일정·휴복학 안내: 서버가 `d_day`를 안 줌 → "D-undefined" 대신 앱에서 계산
- 시간표 직접 입력 저장: 서버는 과목명·학점·시간만 받음(다른 칸이 있으면 400) → 그 셋만 보냄
- 졸업 요건: 서버가 학점을 확정 못 하면 `null` → "null학점" 대신 "확인 필요", 요건 ❔
- 채팅 답에 카드·출처·버튼 칸이 빠져도 멈추지 않게

BE에 요청할 것 (앱은 대신 처리해 둠)
- `GET /home`에 `nickname`, `unread_notifications` (API 명세에 있음)
- `GET /notices/{id}`에 `body`(원문), `eligibility`, `todo_id`, `applied` → 없으면 공지 원문이 비고 '신청 완료 체크' 버튼이 안 나옴
- `GET /scholarships`에 `applied_at`, `GET /scholarship-applications`에 `title`
- `GET /calendar`에 `d_day`, `description` / `GET /timetable`·`/courses`에 `category`·`code`·`professor`·`room` (구분 배지·담당교수 표시용)
- `POST /todos`에 `source.kind = "chat"·"calendar"`를 받을지 결정 (지금은 앱이 빼고 보냄)

## 항목별 정리

✅ 이번에 완성 · 🔧 이번에 고침/보강 · ✔ 원래 있던 것 (FE 표시만 붙임) · ❌ 요청으로 뺌

| FE | 화면 | 상태 | 바뀐 내용 | 파일 |
|---|---|---|---|---|
| 1 | 내비게이션 | ✔🔧 | 필터 칩 공통 부품(`Chips`), 웹에서 휴대폰 폭으로 가운데 표시. (2026-10-27) 머리줄을 화면마다 직접 그림(‹ 초록 제목) | `app/_layout.tsx`, `app/(main)/_layout.tsx`, `components/ui.tsx` |
| 2 | 공통 컴포넌트 | 🔧 | (2026-10-27 새 시안) **화면 틀 `Screen`**(하늘색→연두 배경 + ‹ 제목 + 반투명 흰 판 + 판 아래 고정 버튼), 초록 그라데이션 버튼, 새 창 모양(`Sheet`·`Confirm`·`OptionSheet`), 글자 크기 반영 `Text`, 마스코트 PREVI(`Character`) | `components/ui.tsx`, `components/form.tsx`, `components/Text.tsx`, `lib/theme.ts` |
| 3 | API 클라이언트·예시 데이터 | ✔🔧 | 예시 데이터(공지 9개·학사일정 7개·대화 5개), **학생별 내 정보 저장**, **계정 저장소**(가상 학생 4명 + 회원가입한 계정, 바꾼 비밀번호), 시간표·개설 과목을 시안과 비슷하게 | `lib/api.ts`, `mocks/index.ts` |
| 4 | 로그인 상태 관리 | ✔🔧 | localStorage가 막힌 환경(시크릿 창·임베드)에서도 앱이 안 멈추게 | `lib/session.ts` |
| 5 | 서버 푸시 | 🔧 | 앱이 꺼진 상태에서 알림으로 열 때 이동, 앱 사용 중 수신 시 홈 새로고침, `eas.json`·`expo-dev-client` 추가 | `lib/push.ts`, `eas.json` |
| 6 | 웹 링크·APK | ✅ | 시연 사이트 빌드(`npm run build:demo`), APK 빌드 명령(`npm run build:apk`), 웹용 앱 안 알림창(`DialogHost`) | `scripts/build-demo.mjs`, `app.config.js`, `package.json` |
| 7 | M-1 로그인 · 회원가입 | ✅ | (2026-10-27 새 시안 3장) **로그인**(아이디 = 학번, 비밀번호), **로그인 오류**(칸 빨간 테두리 + "아이디 또는 비밀번호가 맞지 않아요"), **회원가입**(학번·이름·학교 이메일 → 인증번호 받기 → 확인 → 비밀번호 4자 이상 → 가입하면 처음 설정부터). 예시 데이터 / 시연 서버 / Supabase 세 가지 방식 | `app/login.tsx`, `app/signup.tsx`, `components/AuthFrame.tsx`, `lib/auth.ts` |
| 8 | M-2 처음 설정 | 🔧 | **부전공 입력** 추가, 알림 허용을 4단계로 분리, 진행 막대 | `app/(main)/onboarding.tsx` |
| 9 | M-3 마이페이지 | 🔧 | (2026-10-27 새 시안) 알림 시각·**방해 금지 시간**·AI 비서 설정, **다크 모드**·**글자 크기(표준/크게)**, **비밀번호 변경**, 계정 삭제(경고 두 번) | `app/(main)/me/index.tsx`, `lib/display.ts` |
| 10 | M-4 학적 변경 | 🔧 | (2026-10-27 새 시안) 판 아래 버튼 + 마스코트 안내, 확인 창 모양(바꿀 내용 상자·[취소 \| 확인 및 변경 완료]) | `app/(main)/me/status.tsx` |
| 11 | M-5 AI 비서 설정 | 🔧 | **'비서가 볼 정보'**(학적·성적·시간표·이전 대화) 켜기·끄기 | `app/(main)/me/assistant.tsx` |
| 12 | 캐릭터 + 브리핑 | 🔧 | 홈 전체 배경 = **학교배경1**(`home-bg.jpg`, 받은 그림 그대로, 스크롤해도 고정), 왼쪽 위 이름 **PREVI**, 마스코트 PREVI(미어캣, `mascot.png`), 인사말은 줄마다 글자 길이만큼만 뒤를 흐리게. 브리핑 말풍선은 요청으로 기능째 뺌(앱은 `briefing`을 안 씀). 대화 화면·처음 설정·학적 변경의 캐릭터도 모두 미어캣으로 | `app/(main)/index.tsx`, `components/ui.tsx`, `assets/home-bg.jpg`, `assets/mascot.png` |
| 13 | 오늘 챙길 일·다음 일정 | 🔧 | **다음 일정 카드**(피그마 홈 2쪽) → A-2, 웹에서 **마우스로 잡고 끌어 넘기기**·점 눌러 이동 | `app/(main)/index.tsx` |
| 14 | 메뉴 칸 + 비서 한 줄 | 🔧 | 칸마다 **`menu_status` 한 줄**. (2026-10-27) **캠퍼스 생활을 빼고 3칸**(내 학업·장학금·학사 행정)이 같은 폭으로 나눠 씀 | `app/(main)/index.tsx` |
| 15 | 질문창 + 추천 질문 | 🔧 | 아래 바를 **잡고 끌어 올리면 대화 화면이 따라 올라와서 그 자리에서 바로 대화**(앱은 손가락, 웹은 마우스), ↑ 화살표를 누르면 끝까지 올린 것과 같음, 머리줄을 내리거나 ⌄로 닫기. 홈의 추천 질문 칩은 뺌(대화 시작 화면에 추천 질문 있음) | `components/ChatSheet.tsx`, `app/(main)/index.tsx` |
| 16 | T-1 할 일 목록 | 🔧 | 종류 배지, 칩 필터 | `app/(main)/todos/index.tsx` |
| 17 | T-2 할 일 상세 | 🔧 | '완료했어요'를 누르면 **바로 들어오기 전 화면(할 일 목록·홈)으로 돌아가고 그 일이 목록에서 빠짐**. (10/30) 공지 안내(S-2)와 같은 **흰 창**(📋 할 일 ✕): 제목·D-day → ✨ 왜 나에게 해당하나요? → 유의사항, 신청 페이지·프리비에게 묻기는 칸 안의 작은 버튼, 아래 [공지 자세히 보기 \| 완료했어요]. 마감 외 종류는 제목 앞에 [종류] | `app/(main)/todos/[id].tsx`, `components/sheet.ts`(S-2와 같이 씀) |
| 18 | T-3 완료 기록 | ✔ | (변경 없음) | `app/(main)/todos/done.tsx` |
| 19 | T-4 알림 센터 | 🔧 | 종류 아이콘, **모두 읽음**, 누르면 바로 읽음 표시 | `app/(main)/notifications.tsx` |
| 20 | L-1 내 학업 | 🔧 | 졸업 요약(초록 카드) + **시간표·성적 조회로 가는 칸**(새 시안은 각각 한 화면이라 탭 대신) + 영역별 이수(⌄로 들은 과목·성적·영역 평점) | `app/(main)/study/index.tsx`, `components/AreaCard.tsx` |
| 21 | L-2 졸업 요건 | 🔧 | 전체 진행 막대, 영역별 남은 학점(⌄로 들은 과목·성적 펼치기), **관련 마감** 목록 | `app/(main)/study/graduation.tsx`, `components/AreaCard.tsx` |
| 22 | L-3~L-7 시간표 | 🔧 | (2026-10-27 새 시안) **시간표 화면**(과목마다 다른 파스텔 색, 제목 옆 ✎), 수강 과목 편집(점선 + 과목 추가하기, 구분 배지, 교시 표시), 창 4개(추가 방식·과목 검색·직접 입력(교시 고르기)·등록 불가). 추가·빼기는 저장 전까지 이 화면에서만(되돌리기), 겹침·학점(21) 초과·중복은 추가하는 순간 막음 | `study/timetable.tsx`, `study/timetable-edit.tsx`, `lib/schedule.ts`, `components/TimetableGrid.tsx` |
| 23 | L-8~L-10 성적 | 🔧 | (2026-10-27 새 시안) **성적 조회 화면**(초록 요약 카드, 성적 배지 A 초록·B 파랑), 수정 모드(− 바로 삭제, 학기마다 + 과목 추가하기), **성적 항목 추가/수정은 창으로**(과목을 누르면 고치기). 저장하면 다시 계산한 졸업 학점을 알려 줌 | `study/grades.tsx`, `study/grades-edit.tsx`, `components/GradesView.tsx` |
| 24 | S-1 장학금 | 🔧 | (2026-10-27 새 시안) [✓ 신청 완료 n건 → S-3] [! 미신청/신청가능 n건 → 미신청만 보기], 카드 = 상태 배지(신청 완료 초록 · 오늘 마감 빨강 · 그 밖 주황) + 이름 + 신청일/마감. 판정 근거는 장학금 안내에 | `app/(main)/scholarships/index.tsx` |
| 25 | S-2 공지 상세 | 🔧 | (2026-10-27 새 시안) 흰 창(🎓 장학금 안내 ✕) 안에 AI 핵심 요약(마감·나의 판정) → 원문 → 유의사항, 아래 [공지사항 가기 \| 신청 완료 체크] | `app/(main)/notices/[id].tsx` |
| 26 | S-3 신청 내역 | 🔧 | **들어가는 길이 없던 문제** 해결('신청 완료' 칩·'신청 내역 전체 보기') | `scholarships/index.tsx`, `scholarships/applications.tsx` |
| 27 | A-1 나에게 해당하는 공지 | 🔧 | 분류 칩(학사·장학·수업·행사), **마감 지난 공지 숨김**/펼치기, 게시일 | `app/(main)/office/index.tsx` |
| 28 | A-2 학사 일정 | 🔧 | 목록 → **월 달력 + 날짜 누르면 그날 일정** | `app/(main)/office/calendar.tsx` |
| 29 | A-3 휴·복학 안내 | 🔧 | **장학금 영향** 카드, 규정 근거·장학 영향·복학 기간 질문 | `app/(main)/office/leave.tsx` |
| 30 | H-1 채팅 시작 | 🔧 | 피그마 ① 시작 화면(아이콘 추천 질문). (2026-10-27) 이름 **"서경 AI" → "PREVI"**, 위의 큰 캐릭터·입력창 옆 작은 캐릭터를 **미어캣**으로. (10/29) 채팅은 **올리고 내리는 대화창 하나**(모든 화면 위, `(main)/_layout.tsx`)로 통일하고 따로 있던 채팅·대화 기록 화면은 지움. ✎ 새 대화 | `components/ChatPanel.tsx`, `components/ChatSheet.tsx`, `lib/chatStore.ts` |
| 31 | H-2 답변 | 🔧 | 피그마 ② 졸업 요건 카드(진행 막대·체크 목록), 아바타 말풍선, 첫 버튼 강조, 👍👎(10/29~ 서버에 저장, 실패하면 표시 되돌림), 움직이는 '답변 작성 중'. (10/30) 되묻기 버튼 `ask`: "휴학 알려줘"처럼 주제만 물으면 비서가 고를 질문을 버튼으로 주고, 누르면 그 질문을 보냄 | `components/ChatPanel.tsx`, `components/ui.tsx`(InfoCard·TypingDots), `lib/types.ts`(ChatAction) |
| 32 | 맥락 이어받기 | 🔧 | 할 일 '채팅으로 묻기'·공지 '프리비에게 묻기'·휴복학 질문 → 그 화면 위로 대화창이 올라옴(`askChat`), A-3은 `context.kind = 'status'` | `lib/chatStore.ts`, `todos/[id].tsx`, `notices/[id].tsx`, `office/leave.tsx` |
| 33 | 답변 도착 푸시 | ✔ | 알림을 누르면 홈 대화창에 그 대화를 엶(`openNotification`). 팀 결정(10/27)으로 서버는 안 보냄 | `lib/push.ts` |
| 34 | H-3 대화 목록 | 🔧 | 피그마 ⑤ **분류 칩**·아이콘·날짜·미리보기, 고정한 대화 위로, 검색 0.3초 지연. 대화창 안에서 ⏱로 열고, 고른 대화도 창 안에서 | `components/ChatHistory.tsx`, `components/ChatSheet.tsx` |
| 35 | C 분실물 | ❌ | **(2026-10-27 요청으로 뺌)** 홈의 캠퍼스 생활 칸과 함께 분실물 화면 5개·사진 기능·예시 데이터·채팅 연결(C-1)·대화 분류(분실물)를 모두 지움. `expo-image-picker`·`expo-image-manipulator` 패키지도 뺌 | — |

## 조장 확인이 필요한 것 (API 명세에 없는 것)

작업 규칙 6번에 따라 `docs/04_API_명세.md`를 먼저 고쳐야 하는 항목입니다. 앱은 서버가 아직 안 줘도 깨지지 않게 만들어 두었습니다.

| 항목 | 앱이 보내거나 기대하는 모양 | 쓰는 곳 |
|---|---|---|
| 비서가 볼 정보 | `GET·PUT /me`에 `assistant_scope: { grades, timetable, status, chat_history }` (없으면 전부 켠 것으로 봄) | FE 11 |
| 성적 이수 영역 값 | `POST·PUT /grades`의 `area`를 `전공 필수`·`전공 선택`·`교양 필수`·`교양 선택` 4가지로 (명세 예시는 `전공`) | FE 23 |
| 영역별 들은 과목 | `GET /graduation`의 `areas[]`에 `courses: [{ term, course_name, credits, grade }]` (없으면 펼쳤을 때 '아직 없어요') | FE 20·21 |
| 대화 분류·미리보기 | `GET /conversations` 항목에 `category`, `preview` (없으면 앱이 제목으로 분류 추측) | FE 34 |
| 학적 맥락 | `POST /chat`의 `context.kind`에 `"status"` 추가 | FE 29·32 |
| ~~답변 평가~~ | **명세 반영(10/29)**: `PATCH /messages/{id}/feedback { feedback: up\|down\|null }`, 앱이 서버에 저장 (Supabase `012_admin.sql` 적용 필요) | FE 31 |
| ~~되묻기 버튼~~ | **명세 반영(10/30)**: `actions`의 `{ type: "ask", label, payload: { text } }` → 누르면 `payload.text`를 새 질문으로 | FE 31 |
| 로그인 방식 | 학번 + 비밀번호. 실제 모드는 Supabase `signInWithPassword`에 `학번@EMAIL_DOMAIN`을 넣음 → 서버 시연 계정도 `학번@skuniv.ac.kr`이라 맞음 (실제 학생 이메일이 다른 꼴이면 학번→이메일 찾는 API 필요) | FE 7 |
| 회원가입 | Supabase 인증번호 메일(`signInWithOtp` → `verifyOtp`) 후 `updateUser({ password, data: { name, terms_agreed_at } })`. 학번은 받지 않음. 이름은 처음 설정 때 내 정보로 저장 | FE 7 |
| 방해 금지 시간 | `PUT /me`의 `notify.quiet = "22:00-07:00"` (빈 값 = 끔). 서버가 이 시간에는 푸시를 보내지 않아야 함 | FE 9 |

## 직접 확인이 필요한 것 (이번에 확인 못 함)

- **한 학기 최대 학점(FE 22)**: 앱은 21학점으로 막고 있음(`lib/schedule.ts`의 `CREDIT_LIMIT`). 학칙 기준(학년·직전 평점에 따라 다른지)을 BE와 맞춰야 함

- **푸시(FE 5·33)**: 웹·Expo Go에서는 푸시가 오지 않음. `npx eas-cli@latest init`(Expo 계정 필요)으로 projectId를 만든 뒤 `npm run build:dev`로 개발 빌드를 깔아서 확인
- **APK(FE 6)**: `npm run build:apk` (Expo 계정 로그인 필요)
- **실제 로그인·회원가입(FE 7)**: 위 '실제 서버 연결·제출 준비' 1·2번 (Supabase 두 칸 채운 뒤 확인)
- **다크 모드(FE 9)**: 웹·안드로이드는 화면 색을 뒤집는 방식으로 적용. **iOS 앱에는 적용 안 됨**(RN filter 미지원) → iOS까지 하려면 다크용 색 묶음을 따로 만들어야 함
- **실제 서버 연결**: 모든 화면은 예시 데이터로만 확인함. BE API가 나오면 `.env`에서 `EXPO_PUBLIC_USE_MOCK=0`으로 한 번씩 확인

## 참고

- 그림: 홈 배경 `assets/home-bg.jpg`(학교배경1), 마스코트 PREVI `assets/mascot.png` 하나를 모든 화면이 씀. 예전 코끼리 그림(`character*.png`)과 쓰지 않던 `splash-icon.png`는 지움. 그림을 바꾸려면 같은 이름 파일만 바꾸면 됩니다.
- 패키지: `expo-dev-client`(개발 빌드). 분실물 사진용 `expo-image-picker`·`expo-image-manipulator`는 뺐으니 받은 뒤 `npm install`을 다시 해 주세요.
- 글자는 `react-native` 대신 `components/Text.tsx`의 `Text`·`TextInput`을 쓰세요 (마이페이지 글자 크기 '크게'가 반영됨).
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
