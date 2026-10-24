@echo off
chcp 65001 > nul
rem 서경 AI 비서 시연 사이트를 내 PC에서 열기 (예시 데이터 모드, 서버 필요 없음)
cd /d "%~dp0"
echo 서경 AI 비서 시연 사이트: http://localhost:8095/
echo 이 창을 닫으면 사이트도 꺼집니다.
start "" http://localhost:8095/
where python > nul 2> nul
if %errorlevel%==0 (
  python -m http.server 8095 --bind 127.0.0.1
) else (
  npx --yes serve -l 8095 .
)
