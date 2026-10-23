"""홈 GET /home: 브리핑·오늘 챙길 일·다음 일정·메뉴 칸·추천 질문 한 번에."""
from fastapi import APIRouter, Depends

import agent
import db
from auth import current_user
from errors import ApiError
from logic.schedule import d_day

router = APIRouter()


def todo_shape(t: dict, today) -> dict:
    return {"id": t["id"], "type": t["type"], "title": t["title"], "due_date": t["due_date"],
            "d_day": d_day(t["due_date"], today), "done": t["done"]}


def next_event(grade: int, today) -> dict | None:
    ev = db.one(
        """select id, title, start_date from academic_calendar
           where start_date >= %s and (target_grades is null or %s = any(target_grades))
           order by start_date limit 1""",
        [today, grade],
    )
    return ev and {**ev, "d_day": d_day(ev["start_date"], today)}


@router.get("/home")
def home(uid: str = Depends(current_user)):
    p = agent.profile_of(uid)
    if not p:
        raise ApiError(404, "NO_PROFILE", "처음 설정이 필요해요")
    today = agent.today()
    b = db.one("select * from briefings where user_id = %s and date = %s", [uid, today])
    if not b:  # 오늘 아침 계산이 아직이면 지금 계산
        agent.recalc(uid)
        b = db.one("select * from briefings where user_id = %s and date = %s", [uid, today])
    todos = db.all_rows(
        """select * from todos where user_id = %s and not done and (due_date is null or due_date >= %s)
           order by priority desc, due_date nulls last limit 3""",
        [uid, today],
    )
    return {
        "briefing": b["text"],
        "today_todos": [todo_shape(t, today) for t in todos],
        "next_event": next_event(p["grade"], today),
        "menu_status": b["menu_status"],
        "suggested_questions": b["suggested_questions"],
    }
