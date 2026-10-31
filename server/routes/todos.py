from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Path, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from server.auth import AuthenticatedUser, require_user
from server.database import database_rows
from server.errors import APIError
from server.jobs.pipeline import AUTO_REASON, CHECK
from server.routes.notices import notice_by_id

router = APIRouter(tags=["할 일"])
KST = timezone(timedelta(hours=9))
CHECK_HEAD = "직접 확인이 필요해요"
TodoType = Literal["deadline", "scholarship", "graduation", "status"]


class NoticeSource(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["notice"]
    id: int = Field(gt=0)


class TodoInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=200)
    due_date: date | None = None
    type: TodoType = "deadline"
    source: NoticeSource | None = None


class TodoDone(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    done: bool


def shown_reason(reason: str | None) -> str | None:
    """DB의 '[자동] 문장\n근거: a · b — 직접 확인이 필요해요'를 학생에게 보일 줄로. 표시는 파이프라인이 자동 할 일을 가리는 데 쓰니 DB엔 둠."""
    if not reason or not reason.startswith(AUTO_REASON):
        return reason
    said, _, facts = reason.removeprefix(AUTO_REASON).rpartition("근거: ")
    items = facts.split(" · ")
    checks = [f"· {i.removesuffix(CHECK)}" for i in items if i.endswith(CHECK)]
    lines = ([said.strip()] if said.strip() else []) + [i for i in items if not i.endswith(CHECK)]
    return "\n".join(lines + ([CHECK_HEAD] + checks if checks else []))


def todo_output(row: dict, detail=False, today: date | None = None):
    due = date.fromisoformat(row["due_date"]) if row["due_date"] else None
    result = {key: row[key] for key in ("id", "type", "title", "due_date", "done")}
    result["d_day"] = (due - (today or datetime.now(KST).date())).days if due else None
    if detail:
        result.update({"reason": shown_reason(row["reason"]), "link": row["link"], "done_at": row["done_at"],
            "source": {"kind": row["source_kind"], "id": row["source_id"]} if row["source_id"] is not None else None})
    return result


@router.get("/todos")
async def todos(request: Request, type: TodoType | None = None, done: bool | None = Query(default=None), user: AuthenticatedUser = Depends(require_user)):
    params = {"user_id": f"eq.{user.id}", "select": "id,type,title,due_date,done", "order": "due_date.asc.nullslast,id.asc", "limit": 100}
    if type is not None: params["type"] = "eq." + type
    if done is not None: params["done"] = "eq." + str(done).lower()
    return [todo_output(row) for row in await database_rows(request, "GET", "todos", params=params)]


@router.get("/todos/{todo_id}")
async def todo_detail(request: Request, todo_id: int = Path(gt=0), user: AuthenticatedUser = Depends(require_user)):
    rows = await database_rows(request, "GET", "todos", params={"id": f"eq.{todo_id}", "user_id": f"eq.{user.id}"})
    if not rows: raise APIError(404, "TODO_NOT_FOUND", "할 일을 찾을 수 없어요.")
    return todo_output(rows[0], detail=True)


@router.post("/todos")
async def create_todo(body: TodoInput, request: Request, user: AuthenticatedUser = Depends(require_user)):
    values = {"user_id": str(user.id), "title": body.title, "type": body.type,
              "due_date": body.due_date.isoformat() if body.due_date else None}
    if body.source:
        notice = await notice_by_id(request, body.source.id)
        if body.type == "scholarship" and notice["category"] != "장학":
            raise APIError(400, "INVALID_SCHOLARSHIP_SOURCE", "장학 할 일은 장학 공지와 연결해야 해요.")
        values.update({"source_kind": "notice", "source_id": body.source.id, "link": notice["url"],
                       "reason": "사용자가 공지를 보고 등록한 할 일이에요."})
    elif body.type == "scholarship":
        raise APIError(400, "INVALID_SCHOLARSHIP_SOURCE", "신청 내역을 기록하려면 장학 공지를 연결해 주세요.")
    rows = await database_rows(request, "POST", "todos", headers={"Prefer": "return=representation"}, json=values)
    if not rows: raise APIError(500, "DATABASE_ERROR", "할 일 저장 결과를 확인할 수 없어요.")
    return todo_output(rows[0], detail=True)


@router.patch("/todos/{todo_id}")
async def patch_todo(body: TodoDone, request: Request, todo_id: int = Path(gt=0), user: AuthenticatedUser = Depends(require_user)):
    rows = await database_rows(request, "PATCH", "todos", params={"id": f"eq.{todo_id}", "user_id": f"eq.{user.id}"},
        headers={"Prefer": "return=representation"}, json={"done": body.done})
    if not rows: raise APIError(404, "TODO_NOT_FOUND", "할 일을 찾을 수 없어요.")
    return todo_output(rows[0], detail=True)


@router.get("/scholarship-applications")
async def applications(request: Request, user: AuthenticatedUser = Depends(require_user)):
    return await database_rows(request, "GET", "scholarship_applications", params={"user_id": f"eq.{user.id}",
        "select": "id,notice_id,applied_at", "order": "applied_at.desc,id.desc", "limit": 100})
