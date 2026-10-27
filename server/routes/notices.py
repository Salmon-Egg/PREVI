from fastapi import APIRouter, Depends, Path, Request

from server.auth import AuthenticatedUser, require_user
from server.database import database_rows
from server.errors import APIError

router = APIRouter(tags=["공지"])


async def notice_by_id(request: Request, notice_id: int):
    rows = await database_rows(request, "GET", "notices", params={"id": f"eq.{notice_id}",
        "select": "id,title,category,summary,deadline,documents,url,posted_at"})
    if not rows:
        raise APIError(404, "NOTICE_NOT_FOUND", "공지를 찾을 수 없어요.")
    return rows[0]


@router.get("/notices")
async def notices(request: Request, user: AuthenticatedUser = Depends(require_user)):
    # 미분류 공지를 모두 맞춤 공지라고 보여주지 않는다. 판정 결과가 있어야 목록에 표시한다.
    rows = await database_rows(request, "GET", "eligibility", params={"user_id": f"eq.{user.id}",
        "verdict": "in.(eligible,check)", "select": "notice:notices!inner(id,title,category,summary,deadline,posted_at)",
        "order": "notice(posted_at).desc", "limit": 100})
    return [{**row["notice"], "summary": row["notice"]["summary"][:1]} for row in rows]


@router.get("/notices/{notice_id}")
async def notice_detail(request: Request, notice_id: int = Path(gt=0), user: AuthenticatedUser = Depends(require_user)):
    return await notice_by_id(request, notice_id)
