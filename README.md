# PREVI: 서경 AI 비서

학생이 행정 정보를 찾아다니는 대신, **AI 비서가 내 상황에 맞는 일을 먼저 찾아 알려 주는 앱**입니다.

서경대학교 소전 공모전 출품작 · team ecs

## 바로 보기

| | 주소 |
|---|---|
| 학생 웹 | https://previ-skuniv.pages.dev/ |
| 관리자 웹 | https://previ-admin.pages.dev/ |

시연 아이디는 학생 `test_student`, 관리자 `test_admin`입니다. 비밀번호는 제출 담당자가 따로 전달합니다.
로그인과 AI 기능은 학교 API 서버가 켜져 있어야 동작합니다.

## 왜 만들었나

- 학사·장학 정보가 학교 공지, 학과 홈페이지, 대학요람 PDF에 흩어져 있습니다.
- 같은 공지라도 학년, 학점, 소득분위에 따라 대상이 달라 학생이 직접 판단해야 합니다.
- 그래서 장학 신청 마감이나 졸업 요건을 뒤늦게 발견하곤 합니다.

## 무엇을 하나

**학생 앱**

- **오늘 챙길 일:** 공지와 내 정보를 대조해 마감과 할 일을 급한 순서로 보여 줍니다.
- **공지·장학:** 공지를 자동으로 모아 AI가 요약하고, 내가 대상인지 판정합니다. 확실하지 않은 조건은 `확인 필요`로 남깁니다.
- **내 학업:** 졸업 요건, 성적, 시간표를 관리합니다. 텍스트 PDF 성적증명서를 읽어 입력할 수 있습니다.
- **AI 챗봇:** 학교 문서를 근거로 답하고 출처를 함께 보여 줍니다.
- **그 밖에:** 알림, 학사일정, 분실물, 고객센터.

**관리자 웹**

공지·발송 관리, 계정, 챗봇 미응답 질문, 분실물, 고객센터 답변, 학교 자료(학사일정·과목·졸업 기준)를 관리합니다.

## 구조

```
[학생 앱·웹 (Expo)]   [관리자 웹 (React)]
        │                    │
        ▼                    ▼
   ┌───────── 학교 서버 ──────────┐
   │ FastAPI ─ 자체 AI (Ollama)   │
   │ 정해진 시각에 공지 수집·판정·알림 │
   └──────────────────────────────┘
        │
        ▼
 Supabase (로그인·DB·사진·문서 검색)
```

AI는 학교 서버 GPU에서 직접 실행하며, 외부 AI 서비스로 학생 정보를 보내지 않습니다.

| 영역 | 사용 기술 |
|---|---|
| 앱 | Expo (React Native), Expo Router, TypeScript |
| 관리자 웹 | React, Vite |
| 서버 | Python, FastAPI |
| 데이터 | Supabase (PostgreSQL, pgvector) |
| AI | Ollama, Kanana 1.5 8B Instruct, EmbeddingGemma 300M |
| 배포 | GitHub Actions, Cloudflare Pages |

## 폴더

```
├─ app/        학생 앱·웹
├─ admin/      관리자 웹
├─ server/     API, AI 호출, 자동 작업, 테스트
├─ supabase/   데이터 표, 시드 자료, 졸업 요건 조사
├─ docs/       기획, 기술 구조, API 명세, 디자인
└─ demo/       예시 데이터로 보는 시연 사이트 안내
```

## 직접 실행

실행 방법은 폴더별 문서에 있습니다: [서버](server/README.md) · [앱](app/README.md) · [관리자 웹](admin/README.md)

비밀 설정값은 저장소에 없습니다. [.env.example](.env.example)을 복사해 직접 채워 주세요.

## 더 읽을거리

- [기획안](docs/기획/서경%20AI%20비서%20기획안.md) · [메뉴 구성](docs/기획/메뉴구성.md)
- [기술 구조](docs/03_기술_구조.md) · [API 명세](docs/04_API_명세.md) · [데이터 표](docs/05_데이터_표.md)
- [AI 운영 가이드](docs/06_AI_운영_가이드.md)

## 알아 둘 점

- AI 요약과 판정은 틀릴 수 있습니다. 장학·졸업의 최종 확인은 공지 원문과 학과에서 해 주세요.
- 졸업 요건은 대학요람 기준이며, 요람에 전공 필수 과목 이름이 없는 학과는 안내만 표시합니다.
- 사진 읽기는 숫자·날짜 오독이 남아 꺼 두었습니다. 사진 성적증명서와 공지 사진은 읽지 않습니다.
- 학교 공지와 요람은 공개 자료를 수집해 사용합니다. 학교의 별도 허가를 받은 서비스가 아니며, 공모전 출품 목적으로 사용하고 심사 후 수집을 중단합니다.

## 라이선스·출처

| 대상 | 출처 | 조건 |
|---|---|---|
| Kanana 1.5 8B Instruct | Kakao | Apache 2.0 |
| EmbeddingGemma 300M | Google | [Gemma Terms of Use](https://ai.google.dev/gemma/terms) |
| Noto Sans KR (앱 웹판) | Google Fonts | SIL OFL 1.1 |
| Pretendard (관리자 웹) | jsDelivr | SIL OFL 1.1 |
| Feather, Material Community Icons | `@expo/vector-icons` | MIT, Apache 2.0 |
| 캐릭터, 홈 배경, 앱 아이콘, `app/assets/icons/` | ChatGPT로 생성 | OpenAI 약관 |
