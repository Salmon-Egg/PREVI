"""고객센터: 학생이 관리자에게 보내는 문의. 답변은 관리자 웹(/admin/support)에서."""
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field

from server.auth import AuthenticatedUser, require_user
from server.database import database_rows
from server.errors import APIError

router = APIRouter(tags=["고객센터"])
FIELDS = "id,created_at,category,title,body,answer,answered_at"


class TicketInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    category: Literal["앱 오류", "계정", "기타"]
    title: str = Field(min_length=1, max_length=100)
    body: str = Field(min_length=1, max_length=2000)


@router.get("/support")
async def tickets(request: Request, user: AuthenticatedUser = Depends(require_user)):
    return await database_rows(request, "GET", "support_tickets", params={
        "user_id": f"eq.{user.id}", "select": FIELDS, "order": "id.desc", "limit": 100})


@router.post("/support", status_code=201)
async def create_ticket(body: TicketInput, request: Request, user: AuthenticatedUser = Depends(require_user)):
    rows = await database_rows(request, "POST", "support_tickets", params={"select": FIELDS},
                               headers={"Prefer": "return=representation"}, json=body.model_dump())
    if not rows: raise APIError(500, "DATABASE_ERROR", "문의 저장 결과를 확인할 수 없어요.")
    return rows[0]
