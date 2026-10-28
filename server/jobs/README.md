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
`--save`로 수집하면 공지 AI 해석 → 학생별 판정 → 자동 할 일 → 새 맞춤 공지 알림까지 연결합니다.
AI가 실패하거나 마감 형식이 깨지면 `failed`로 남기고 다음 작업에서 재시도합니다.
기존 단위 테스트는 실제 DB나 푸시를 사용하지 않습니다. `server.check_pipeline_live`는 별도 실행하는 실제 DB 검사입니다.
본문 이미지와 첨부는 확인된 주소/식별자만 기록하고 파일 다운로드·OCR은 수행하지 않습니다.
설치: 저장소 최상위에서 `.venv\Scripts\python.exe -m pip install -r server/requirements.txt`.

Linux 배포 후 crontab 예시 (실제 서버 경로로 수정, `logs` 폴더를 먼저 생성):

```cron
CRON_TZ=Asia/Seoul
0 9,13,18 * * * cd /opt/seokyeong-ai-secretary && flock -n /tmp/sku-pipeline.lock .venv/bin/python -m server.jobs.collect_notices --save --pages 3 --max-posts 150 >> logs/notices.log 2>&1
50 8 * * * cd /opt/seokyeong-ai-secretary && flock -n /tmp/sku-pipeline.lock .venv/bin/python -m server.jobs.daily_check --extract >> logs/daily.log 2>&1
*/5 * * * * cd /opt/seokyeong-ai-secretary && flock -n /tmp/sku-pipeline.lock .venv/bin/python -m server.jobs.daily_check --reminders-only >> logs/reminders.log 2>&1
```

CRON_TZ를 지원하는 cron인지 확인하고, 미지원 환경은 서버 시간대를 Asia/Seoul로 설정합니다.
이 예시는 아직 학교 서버에 등록하지 않았습니다. Windows 개발 PC에서는 직접 명령으로 검사합니다.
수집이 일부 실패하면 종료 코드 1과 글 번호/오류 종류가 로그에 남습니다.
수집 실패 글과 AI 처리 실패 글은 다음 회차에 재시도합니다. 한 번에 AI 처리하는 공지는 최대 20개입니다.
기존 실패 글이 새 글을 계속 막지 않도록 pending을 먼저 처리합니다.

마감 전날·당일과 일정 시작일 알림은 학생이 지정한 시간 이후에 보냅니다.
방해 금지 시간에는 예약하지 않고 다음 5분 점검에서 재시도하며, 고유 event_key로 중복을 막습니다.
당일 방해 금지 종료가 다음 날이면 전날 알림은 생략하고 당일 조건을 다시 검사합니다.
성적·학적·시간표 저장 뒤에는 해당 학생만 백그라운드에서 재판정합니다. 실패는 로그에 남고 아침 전체 점검이 복구합니다.
완료한 할 일과 수동 할 일은 유지하며, 조건에서 제외된 미완료 자동 할 일만 삭제합니다.
동의하지 않은 학생은 자동 계산·알림에서 제외합니다. 성적 사용이 꺼지면 성적을 조회하지 않고 관련 조건을 확인 필요로 둡니다.

운영 전 Supabase에 `011_notification_reservation_fix.sql`을 적용합니다.
008의 알림 함수는 행 변수와 공지 별칭이 모두 `n`이어서 실제 예약 시 모호한 컬럼 오류가 납니다.
011은 함수를 교체하며 기존 데이터는 지우지 않습니다.
`PUSH_ENABLED=false`에서는 알림 센터에만 기록합니다. 실제 폰 수신은 GPU 서버·Expo·앱의 별도 통합 검사가 필요합니다.
한 서버에서 cron만 등록하고, 다른 PC에 같은 cron을 중복 등록하지 마세요.
