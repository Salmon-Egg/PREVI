# 시연 계정 준비

지정한 학번 20260001·20250002·20240003·20210004는 실제 학생이 아닌 가상 페르소나입니다.
아래 명령은 계정 확인 → 없는 시연 계정 생성 → 학적·성적 시드 순서입니다.

```powershell
python -m server.scripts.create_demo_accounts
python -m server.scripts.create_demo_accounts --create --credentials C:\private\demo_accounts.private.json
python -m server.scripts.seed_personas
```

비밀번호 파일의 상위 폴더는 먼저 만들어야 합니다. 경로는 Git 저장소 밖으로 지정합니다.
스크립트는 계정 생성 전에 무작위 비밀번호를 파일에 저장하고 비밀번호를 출력하지 않습니다.
계정은 관리자 API로 인증 완료 상태로 만들며 실제 학교 메일을 보내지 않습니다.
같은 계정이 이미 있으면 비밀번호를 바꾸지 않습니다. 기존 계정의 비밀번호는 원래 생성자에게 확인하세요.
비밀번호 파일과 서버 키는 커밋하거나 PR에 붙이지 않습니다.

`seed_personas`는 시연 프로필을 갱신하고 홍길동의 기존 성적을 교체하므로 실제 계정에 사용하면 안 됩니다.
홍길동은 앱 예시와 같은 43과목이며 실제 졸업 기준과 비교해 표시합니다. 예시 화면 숫자로 기준을 바꾸지 않습니다.
앱의 mock/dev 로그인을 끄고 Supabase 로그인으로 검사해야 실제 토큰이 발급됩니다.
