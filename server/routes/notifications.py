from fastapi import APIRouter, Depends, Path, Request
from pydantic import BaseModel, ConfigDict

from server.auth import AuthenticatedUser, require_user
from server.database import database_rows
from server.errors import APIError

router = APIRouter(tags=["알림"])
FIELDS = "id,type,title,target_id,read,sent_at"


class ReadInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    read: bool


@router.get("/notifications")
async def notifications(request: Request, user: AuthenticatedUser = Depends(require_user)):
    return await database_rows(request, "GET", "notifications", params={"user_id":"eq."+str(user.id),
        "select":FIELDS,"order":"sent_at.desc,id.desc","limit":100})


@router.patch("/notifications/{notification_id}")
async def mark_read(body: ReadInput, request: Request, notification_id: int = Path(gt=0), user: AuthenticatedUser = Depends(require_user)):
    rows = await database_rows(request, "PATCH", "notifications", params={"id":f"eq.{notification_id}","user_id":"eq."+str(user.id),"select":FIELDS},
        headers={"Prefer":"return=representation"},json={"read":body.read})
    if not rows: raise APIError(404,"NOTIFICATION_NOT_FOUND","알림을 찾을 수 없어요.")
    return rows[0]
