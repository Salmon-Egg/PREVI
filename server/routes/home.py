from datetime import datetime

from fastapi import APIRouter, Depends, Request

from server.auth import AuthenticatedUser, require_user
from server.database import database_rows
from server.errors import APIError
from server.routes.calendar import calendar_rows, next_calendar_event
from server.routes.graduation import graduation_result
from server.routes.scholarships import scholarship_rows
from server.routes.todos import KST, todo_output

router = APIRouter(tags=["홈"])


def scholarship_status(rows: list[dict], now: datetime):
    available = [row for row in rows if row["verdict"] == "eligible" and not row["applied"] and
                 (row["deadline"] is None or datetime.fromisoformat(row["deadline"].replace("Z", "+00:00")) >= now)]
    if available:
        today_deadline = any(row["deadline"] and datetime.fromisoformat(row["deadline"].replace("Z", "+00:00")).astimezone(KST).date() == now.astimezone(KST).date() for row in available)
        return f"신청 가능 {len(available)}건" + (" · 오늘 마감" if today_deadline else "")
    if any(row["verdict"] == "check" and not row["applied"] and
           (row["deadline"] is None or datetime.fromisoformat(row["deadline"].replace("Z", "+00:00")) >= now) for row in rows):
        return "장학 조건 확인 필요"
    return "신청 가능 판정 없음" if rows else "장학 자격 판정 대기"


@router.get("/home")
async def home(request: Request, user: AuthenticatedUser = Depends(require_user)):
    now = datetime.now(KST)
    today = now.date()
    todo_rows = await database_rows(request, "GET", "todos", params={"user_id": f"eq.{user.id}", "done": "eq.false",
        "select": "id,type,title,due_date,done", "order": "due_date.asc.nullslast,id.asc", "limit": 3})
    items = [{key: value for key, value in todo_output(row, today=today).items() if key != "done"} for row in todo_rows]
    try:
        graduation = await graduation_result(request, user)
        remaining = graduation["remaining_total"]
        study = f"입력 성적 기준 {remaining:g}학점 남음 · 세부요건 확인" if remaining is not None else "적용 졸업 기준·학점 인정 확인 필요"
    except APIError as exc:
        if exc.status not in (400, 404, 409):
            raise
        study = "학과·입학년도 입력 필요" if exc.code in ("PROFILE_NOT_FOUND", "PROFILE_INCOMPLETE") else "적용 졸업 기준 확인 필요"
    events = await calendar_rows(request, user)
    scholarships = await scholarship_rows(request, user)
    # 읽음 상태가 없는 공지를 '새 공지'라고 부르지 않는다. 조회 범위 내 공지 수를 표시한다.
    matched = await database_rows(request, "GET", "eligibility", params={"user_id": f"eq.{user.id}", "verdict": "in.(eligible,check)", "select": "id", "limit": 100})
    count = len(matched)
    admin = (f"맞춤 공지 {count}건" if count < 100 else "맞춤 공지 100건 이상") if count else "맞춤 공지 판정 대기"
    briefing = "먼저 챙길 일: " + " · ".join(row["title"] for row in todo_rows) if items else "현재 등록된 미완료 할 일이 없어요. 학업 정보와 공지를 확인해 보세요."
    return {"briefing": briefing, "today_todos": items, "next_event": next_calendar_event(events, today),
            "menu_status": {"study": study, "scholarship": scholarship_status(scholarships, now), "admin": admin},
            "suggested_questions": ["졸업까지 뭐가 남았어?", "내가 신청할 수 있는 장학금은?", "다음 학사일정은 언제야?"]}
