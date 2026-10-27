from fastapi import APIRouter, Depends, Request

from server.auth import AuthenticatedUser, require_user
from server.database import database_rows

router = APIRouter(tags=["장학"])


async def scholarship_rows(request: Request, user: AuthenticatedUser):
    matches = []
    while True:
        page = await database_rows(request, "GET", "eligibility", params={"user_id": f"eq.{user.id}",
            "select": "verdict,reasons,notice:notices!inner(id,title,deadline)", "notice.category": "eq.장학",
            "order": "notice(deadline).asc.nullslast,id.asc", "limit": 100, "offset": len(matches)})
        matches.extend(page)
        if not page:
            break
    applications = []
    while True:
        page = await database_rows(request, "GET", "scholarship_applications", params={"user_id": f"eq.{user.id}",
            "select": "notice_id", "order": "id.asc", "limit": 100, "offset": len(applications)})
        applications.extend(page)
        if not page:
            break
    applied = {row["notice_id"] for row in applications}
    return [{"notice_id": row["notice"]["id"], "title": row["notice"]["title"], "deadline": row["notice"]["deadline"],
             "verdict": row["verdict"], "reasons": row["reasons"], "applied": row["notice"]["id"] in applied} for row in matches]


@router.get("/scholarships")
async def scholarships(request: Request, user: AuthenticatedUser = Depends(require_user)):
    return await scholarship_rows(request, user)
