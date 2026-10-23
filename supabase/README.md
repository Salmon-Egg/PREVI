# supabase/ — 데이터 표와 시드 데이터

담당: BE A

```
supabase/
├─ migrations/001_init.sql   표 만들기 (docs/05_데이터_표.md 기준). 모든 표에 RLS를 켜서 앱 키로는 직접 못 읽게 막음
└─ seed/seed.sql             시연용 데이터: 졸업 기준 2개 학과, 과목, 학사일정, 학사요람 문단, 가상 학생 4명
```

## Supabase에 처음 올리기
가장 쉬운 방법: 서버 `.env`에 Supabase `DATABASE_URL`을 넣고 `server/`에서 `python -m scripts.init_db`
(표 만들기 → 시드 → 문서 임베딩 → 예시 공지 수집 → 학생별 계산까지 한 번에)

SQL Editor에 직접 붙여 넣어도 됩니다: `001_init.sql` → `seed.sql` 순서.

## Supabase 화면에서 할 설정 (로그인)
- Authentication › Sign In / Providers › Email 켜기 (비밀번호 없이 이메일 인증번호로 로그인)
- Authentication › Emails › Magic Link 템플릿에 `{{ .Token }}`이 들어가게 (앱이 6자리 번호를 입력받음)
- 학교 이메일만 받기: 서버 `.env`의 `ALLOWED_EMAIL_DOMAIN`, 앱 `.env`의 `EXPO_PUBLIC_EMAIL_DOMAIN`

## 주의
- 졸업 기준·학사요람 문장·과목 시간은 **예시 값**입니다. 실제 학사요람을 받으면 `seed.sql`을 고칩니다.
- 실제 학생 정보는 넣지 않습니다. 시연은 가상 학생 4명으로 합니다.
- 계정을 지우면(`DELETE /me`) profiles에 연결된 모든 표(성적 포함)가 함께 지워집니다 (`on delete cascade`).
- 표를 바꾸면 `docs/05_데이터_표.md`도 함께 고칩니다.
