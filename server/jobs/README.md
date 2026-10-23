# server/jobs/ — 정해진 시각에 도는 작업

담당: BE A · BE B

| 파일 | 언제 | 하는 일 |
|---|---|---|
| `collect_notices.py` | 9·13·18시 | 공개 게시판 새 글 수집 → ①② AI 정리 → 학생별 다시 계산 → 나에게 해당하는 새 공지 알림 |
| `daily_check.py` | 매시 정각 | 알림 시간이 지금인 학생만: 비서 다시 계산 → 마감 전날·당일, 학사일정 3일 전·당일 알림 |
| `sample_board.json` | — | `BOARD_URL`이 비어 있을 때 쓰는 예시 공지 6개 (`{D+7}` = 오늘부터 7일 뒤) |

직접 실행 (server/ 폴더에서):
```
python -m jobs.collect_notices
python -m jobs.daily_check --now      # --now: 시각 상관없이 모든 학생 지금 처리 (시연용)
```

학교 서버(Linux) cron 등록 예시 (`crontab -e`):
```
0 9,13,18 * * *  cd /경로/server && .venv/bin/python -m jobs.collect_notices >> jobs.log 2>&1
0 * * * *        cd /경로/server && .venv/bin/python -m jobs.daily_check >> jobs.log 2>&1
```

- 두 작업 모두 여러 번 돌려도 공지가 중복 저장되거나 알림이 두 번 가지 않습니다 (`board_post_id`, `notifications.dedupe_key`).
- 수집은 로그인 없이 볼 수 있는 공개 게시판만 대상으로 합니다. 실패하면 `crawl_logs`에 남고 다음 회차에 다시 시도합니다.
- 학교 게시판 구조를 확인한 뒤 `.env`의 `BOARD_URL`, `BOARD_LINK_PATTERN`, `BOARD_BODY_SELECTOR`를 맞춰야 합니다.
