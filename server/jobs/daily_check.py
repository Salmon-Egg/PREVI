"""매일 점검 + 마감·학사일정 알림.  server/ 폴더에서:  python -m jobs.daily_check [--now]

cron으로 매시 정각에 돌리면, 알림 시간(notify_time)이 지금 시각인 학생만 처리합니다.
--now 를 붙이면 시각과 상관없이 모든 학생을 지금 처리합니다 (시연·시드 직후용).
shortcut: 알림 시간은 '시' 단위로만 맞춤 (09:30 → 9시에 보냄). 분 단위가 필요하면 cron을 더 자주 돌리기."""
import sys
from datetime import datetime, timedelta

import agent
import db
import notify
from logic.schedule import d_day


def run(all_now: bool = False) -> None:
    now = datetime.now(agent.KST)
    today = now.date()
    done = 0
    for p in db.all_rows("select * from profiles where grade is not null"):
        if not all_now and p["notify_time"].hour != now.hour:
            continue
        uid = p["user_id"]
        agent.recalc(uid)  # ③~⑦

        # 마감 전날·당일 (각각 한 번씩만)
        for t in db.all_rows("select id, title, due_date from todos where user_id = %s and not done and due_date between %s and %s",
                             [uid, today, today + timedelta(days=1)]):
            dd = d_day(t["due_date"], today)
            notify.send(uid, "deadline", f"{t['title']} 마감이 {'오늘' if dd == 0 else '내일'}이에요", t["id"], f"deadline:{t['id']}:d{dd}")

        # 학사일정 3일 전·당일
        for ev in db.all_rows(
            """select id, title, start_date from academic_calendar
               where start_date in (%s, %s) and (target_grades is null or %s = any(target_grades))""",
            [today, today + timedelta(days=3), p["grade"]],
        ):
            dd = d_day(ev["start_date"], today)
            notify.send(uid, "calendar", f"{ev['title']}이(가) {'오늘' if dd == 0 else '3일 뒤'} 시작돼요", ev["id"], f"calendar:{ev['id']}:d{dd}")
        done += 1
    print(f"점검 완료: 학생 {done}명")


if __name__ == "__main__":
    run(all_now="--now" in sys.argv)
