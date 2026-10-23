"""AI 비서 계산 (AI 작업 플로우 ③~⑦). 학생 한 명을 다시 계산해서 eligibility·todos·briefings 표를 채웁니다.

부르는 곳
- 성적·학적·시간표가 바뀔 때: routes/grades.py, routes/me.py
- 새 공지를 수집한 뒤: jobs/collect_notices.py
- 매일 아침: jobs/daily_check.py
- 오늘 브리핑이 아직 없을 때 홈을 열면: routes/home.py
"""
from datetime import datetime, timedelta, timezone

import db
from ai import tasks
from db import Json
from logic.eligibility import judge, matches_target
from logic.grades import last_term
from logic.graduation import progress
from logic.schedule import d_day, priority

KST = timezone(timedelta(hours=9))


def today():
    return datetime.now(KST).date()


def profile_of(uid: str) -> dict | None:
    return db.one("select * from profiles where user_id = %s", [uid])


def grades_of(uid: str) -> list[dict]:
    return db.all_rows("select id, term, course_name, credits, grade, area from grades where user_id = %s order by id", [uid])


def graduation_of(profile: dict, items: list[dict]) -> dict | None:
    """GET /graduation 모양. 학과 기준이 없으면 None."""
    req = db.one(
        """select * from grad_requirements where department = %s and (admission_year = %s or admission_year is null)
           order by admission_year nulls last limit 1""",
        [profile["department"], profile["admission_year"]],
    )
    if not req:
        return None
    prog = progress(req, items, profile["completed_requirements"])
    for r in prog["requirements"]:  # 할 일과 연결 (L-2에서 누르면 T-2로)
        todo = db.one("select id from todos where user_id = %s and type = 'graduation' and title = %s and not done",
                      [profile["user_id"], r["name"]])
        if todo:
            r["todo_id"] = todo["id"]
    return prog


def _upsert_todo(uid: str, key: str, type_: str, title: str, due, reason: str | None, link: str | None,
                 source_kind: str | None, source_id: int | None) -> None:
    """비서가 만든 할 일은 auto_key로 한 번만 생김. 이미 있으면 제목·마감·링크만 고침 (끝낸 일은 그대로)."""
    exists = db.one("select id from todos where user_id = %s and auto_key = %s", [uid, key])
    severity = tasks.severity(type_, title) if not exists else 2  # 새로 생길 때만 AI에게 물음 (update에는 안 쓰임)
    db.run(
        """insert into todos (user_id, auto_key, type, title, due_date, reason, link, source_kind, source_id, severity)
           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           on conflict (user_id, auto_key) do update set
             title = excluded.title, due_date = excluded.due_date, link = excluded.link,
             reason = coalesce(excluded.reason, todos.reason)""",
        [uid, key, type_, title, due, reason, link, source_kind, source_id, severity],
    )


def recalc(uid: str) -> dict:
    """③ 판정 → 할 일 만들기 → ④ 우선순위 → ⑤⑦ 브리핑. 반환값은 성적 API의 recalculated에 씀."""
    p = profile_of(uid)
    if not p or not p["grade"]:
        return {"remaining_total": None, "new_eligible_scholarships": 0}
    items = grades_of(uid)
    last_gpa, last_credits = last_term(items)
    eligible_before = db.one("select count(*) as n from eligibility where user_id = %s and verdict = 'eligible'", [uid])["n"]
    keep: set[str] = set()

    # ③-a 졸업 요건: 졸업 예정 학년이면 끝내지 않은 인증을 할 일로
    grad = graduation_of(p, items)
    if grad and p["grade"] >= 4:
        for r in grad["requirements"]:
            if r["done"] or r["name"].startswith("필수 과목"):
                continue
            n = db.one("select id, deadline, url from notices where title like %s and deadline >= now() order by deadline limit 1",
                       [f"%{r['name']}%"])
            key = f"notice:{n['id']}" if n else f"grad:{r['name']}"
            _upsert_todo(uid, key, "graduation", r["name"], n and n["deadline"].astimezone(KST).date(),
                         f"졸업 예정자는 '{r['name']}'을(를) 마쳐야 해요. 아직 완료 기록이 없어요.",
                         n and n["url"], "notice" if n else "graduation", n and n["id"])
            keep.add(key)

    # ③-c 학적: 휴학 중이면 복학 신청을 할 일로 (복학 공지가 있으면 그 마감, 없으면 학사일정)
    if p["status"] == "leave":
        n = db.one("select id, title, deadline, url from notices where title like %s and deadline >= now() order by deadline limit 1",
                   ["%복학%"])
        ev = None if n else db.one("select id, end_date from academic_calendar where title like %s and end_date >= %s "
                                   "order by start_date limit 1", ["%복학%", today()])
        key = f"notice:{n['id']}" if n else "status:return"
        _upsert_todo(uid, key, "status", "복학 신청", n["deadline"].astimezone(KST).date() if n else ev and ev["end_date"],
                     "휴학 중이에요. 복학하려면 복학 신청 기간 안에 신청해야 하고, 놓치면 제적될 수 있어요.",
                     n and n["url"], "notice" if n else "calendar", (n or ev or {}).get("id"))
        keep.add(key)

    # ③-b 공지: 장학은 조건 대조, 학사 공지는 대상이면 할 일로
    applied = {r["notice_id"] for r in db.all_rows("select notice_id from scholarship_applications where user_id = %s", [uid])}
    notices = db.all_rows("select * from notices where processed_at is not null and (deadline is null or deadline >= now())")
    for n in notices:
        key = f"notice:{n['id']}"
        due = n["deadline"] and n["deadline"].astimezone(KST).date()
        title = n["title"].removesuffix(" 안내")  # 할 일 제목은 '…신청'으로 끝나게
        if n["category"] == "장학":
            verdict, reasons = judge(n["target"], n["conditions"], p, last_gpa, last_credits)
            prev = db.one("select verdict, reasons from eligibility where user_id = %s and notice_id = %s", [uid, n["id"]])
            db.run(
                """insert into eligibility (user_id, notice_id, verdict, reasons) values (%s, %s, %s, %s)
                   on conflict (user_id, notice_id) do update set verdict = excluded.verdict, reasons = excluded.reasons, updated_at = now()""",
                [uid, n["id"], verdict, Json(reasons)],
            )
            if verdict == "ineligible" or n["id"] in applied or key in keep:
                continue
            has_todo = db.one("select 1 from todos where user_id = %s and auto_key = %s", [uid, key])
            changed = prev is None or prev["verdict"] != verdict or prev["reasons"] != reasons
            reason = tasks.explain_reason(n["title"], verdict, reasons) if changed or not has_todo else None  # ⑥
            _upsert_todo(uid, key, "scholarship", title, due, reason, n["url"], "notice", n["id"])
            keep.add(key)
        elif n["category"] == "학사" and due and key not in keep and any(n["target"].values()) and matches_target(n["target"], p):
            _upsert_todo(uid, key, "deadline", title, due, "학적·학년이 공지 대상에 해당해요. " + " ".join(n["summary"][:1]),
                         n["url"], "notice", n["id"])
            keep.add(key)

    # 조건이 바뀌어 더는 해당하지 않는 '안 끝낸' 자동 할 일은 지움 (학생이 직접 추가한 할 일은 auto_key가 없어 남음)
    db.run("delete from todos where user_id = %s and auto_key is not null and not done and not (auto_key = any(%s))",
           [uid, list(keep)])

    # ④ 우선순위 = 피해 크기(AI) + 마감 가까움(코드)
    now = today()
    todos = db.all_rows("select id, type, title, due_date, severity from todos where user_id = %s and not done", [uid])
    for t in todos:
        t["d_day"] = d_day(t["due_date"], now)
        db.run("update todos set priority = %s where id = %s", [priority(t["severity"], t["d_day"]), t["id"]])

    # ⑤⑦ 브리핑 · 메뉴 칸 문구 · 추천 질문
    elig = db.all_rows(
        """select e.verdict, n.deadline from eligibility e join notices n on n.id = e.notice_id
           where e.user_id = %s and (n.deadline is null or n.deadline >= now())
             and not exists (select 1 from scholarship_applications a where a.user_id = e.user_id and a.notice_id = e.notice_id)""",
        [uid],
    )
    eligible = [e for e in elig if e["verdict"] == "eligible"]
    eligible_today = any(e["deadline"] and e["deadline"].astimezone(KST).date() == now for e in eligible)
    checks = sum(e["verdict"] == "check" for e in elig)
    new_notices = sum(
        1 for n in notices
        if n["posted_at"] and n["posted_at"] >= datetime.now(KST) - timedelta(days=7) and matches_target(n["target"], p)
    )
    remaining = grad["remaining_total"] if grad else None
    upcoming = sorted((t for t in todos if t["d_day"] is not None and t["d_day"] >= 0), key=lambda t: t["d_day"])
    facts = {
        "nickname": p["nickname"], "grade": p["grade"], "status": p["status"],
        "due_today": sum(t["d_day"] == 0 for t in todos),
        "eligible_scholarships": len(eligible),
        "remaining_credits": remaining,
        "top_todos": [f"{t['title']} (D-{t['d_day']})" for t in upcoming[:3]],
    }
    written = tasks.write_briefing(facts)
    menu_status = {
        "study": "성적을 입력해 주세요" if not items else f"졸업까지 {remaining}학점" if remaining else "졸업 학점을 모두 채웠어요",
        "scholarship": (f"신청 가능 {len(eligible)}건" + (" · 오늘 마감" if eligible_today else "")) if eligible
                       else f"확인 필요 {checks}건" if checks else "새 장학 공지 없음",
        "admin": f"새 공지 {new_notices}건" if new_notices else "새 공지 없음",
        "campus": "준비 중",  # 분실물(최후순위)을 만들면 '비슷한 습득물 1건' 같은 문구로
    }
    db.run(
        """insert into briefings (user_id, date, text, menu_status, suggested_questions) values (%s, %s, %s, %s, %s)
           on conflict (user_id, date) do update set text = excluded.text, menu_status = excluded.menu_status,
             suggested_questions = excluded.suggested_questions""",
        [uid, now, written["briefing"], Json(menu_status), Json(written["suggested_questions"])],
    )
    return {"remaining_total": remaining, "new_eligible_scholarships": max(0, len(eligible) - eligible_before)}
