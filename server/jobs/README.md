# server/jobs/ — 정해진 시각에 도는 작업

담당: BE A · BE B

| 파일 (예정) | 언제 | 하는 일 |
|---|---|---|
| `collect_notices.py` | 9·13·18시 | 학교 공개 게시판에서 새 글 수집 → AI 정리 → 대상 학생 판정 → 새 공지 알림 |
| `daily_check.py` | 매일 아침 (9시 전) | 졸업 요건·장학 판정 → 오늘 챙길 일 정렬 → 브리핑 → 마감·학사일정 알림 |

- 서버의 cron(정해진 시각에 실행해 주는 기능)에 등록합니다.
- 수집은 로그인 없이 볼 수 있는 공개 게시판만 대상으로 합니다.
- 같은 작업을 두 번 실행해도 공지가 중복 저장되거나 알림이 두 번 가지 않게 만듭니다.

## 현재 구현

`collect_notices.py`는 공개 학사·장학 게시판의 목록과 본문을 읽고 새 글만 저장합니다.
AI 요약·학생별 판정·알림은 아직 연결 전이며, 저장된 글은 `extraction_status=pending`입니다.
본문 이미지와 첨부는 확인된 주소/식별자만 기록하고 파일 다운로드·OCR은 수행하지 않습니다.
설치: 저장소 최상위에서 `.venv\Scripts\python.exe -m pip install -r server/requirements.txt`.

Linux 배포 후 crontab 예시 (실제 서버 경로로 수정, `logs` 폴더를 먼저 생성):

```cron
CRON_TZ=Asia/Seoul
0 9,13,18 * * * cd /opt/seokyeong-ai-secretary && .venv/bin/python -m server.jobs.collect_notices --save --pages 3 --max-posts 150 >> logs/notices.log 2>&1
```

CRON_TZ를 지원하는 cron인지 확인하고, 미지원 환경은 서버 시간대를 Asia/Seoul로 설정합니다.
이 예시는 아직 학교 서버에 등록하지 않았습니다. Windows 개발 PC에서는 직접 명령으로 검사합니다.
수집이 일부 실패하면 종료 코드 1과 글 번호/오류 종류가 로그에 남습니다.
수집 실패 글은 다음 회차에 재시도합니다. 저장한 글은 건너뛰므로 `pending/failed` AI 재처리는 BE B 작업입니다.
