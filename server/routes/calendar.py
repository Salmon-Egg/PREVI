from datetime import date

from fastapi import APIRouter, Depends, Query, Request

from server.auth import AuthenticatedUser, require_user
from server.database import database_rows
from server.logic.student_context import calendar_applies

router = APIRouter(tags=["학사일정"])


async def calendar_rows(request: Request, user: AuthenticatedUser, year: int | None = None):
    profiles = await database_rows(request, "GET", "profiles", params={"user_id": f"eq.{user.id}", "select": "grade,status"})
    profile = profiles[0] if profiles else {}
    params = {"select": "id,title,start_date,end_date,target_grades", "order": "start_date.asc,id.asc"}
    if year is not None:
        params["start_date"] = f"lte.{year}-12-31"
        params["end_date"] = f"gte.{year}-01-01"
    rows = []
    while True:
        page = await database_rows(request, "GET", "academic_calendar", params={**params, "limit": 100, "offset": len(rows)})
        rows.extend(page)
        if not page:
            break
    # 학년 미입력자는 전체 공통 일정만 표시한다. 12~1월처럼 연도를 넘는 일정도 포함한다.
    return [row for row in rows if calendar_applies(row,profile)]


@router.get("/calendar")
async def calendar(request: Request, year: int | None = Query(default=None, ge=1900, le=2100), user: AuthenticatedUser = Depends(require_user)):
    return await calendar_rows(request, user, year)


def next_calendar_event(rows: list[dict], today: date):
    # 이미 진행 중인 일정도 종료 전까지 챙길 대상으로 보여준다.
    upcoming = [row for row in rows if date.fromisoformat(row["end_date"]) >= today]
    if not upcoming:
        return None
    row = min(upcoming, key=lambda item: (max(date.fromisoformat(item["start_date"]), today), item["start_date"], item["id"]))
    return {key: row[key] for key in ("id", "title", "start_date")} | {"d_day": max((date.fromisoformat(row["start_date"]) - today).days, 0)}
