"""할 일 (T-1 ~ T-3)."""
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

import agent
import db
from auth import current_user
from errors import not_found
from routes.home import todo_shape

router = APIRouter()
TodoType = Literal["deadline", "scholarship", "graduation", "status"]


def _detail(t: dict) -> dict:
    return {**todo_shape(t, agent.today()), "reason": t["reason"], "link": t["link"],
            "source": {"kind": t["source_kind"], "id": t["source_id"]} if t["source_kind"] else None,
            "done_at": t["done_at"]}


@router.get("/todos")
def list_todos(type: TodoType | None = None, done: bool | None = None, uid: str = Depends(current_user)):
    rows = db.all_rows(
        """select * from todos where user_id = %s and (%s::text is null or type = %s) and (%s::bool is null or done = %s)
           order by done, due_date nulls last, priority desc""",
        [uid, type, type, done, done],
    )
    today = agent.today()
    return [{**todo_shape(t, today), "done_at": t["done_at"]} for t in rows]


@router.get("/todos/{todo_id}")
def get_todo(todo_id: int, uid: str = Depends(current_user)):
    t = db.one("select * from todos where id = %s and user_id = %s", [todo_id, uid])
    if not t:
        raise not_found("할 일")
    return _detail(t)


class Source(BaseModel):
    kind: str
    id: int | None = None


class TodoIn(BaseModel):
    title: str
    due_date: date | None = None
    type: TodoType = "deadline"
    source: Source | None = None


@router.post("/todos", status_code=201)
def add_todo(body: TodoIn, uid: str = Depends(current_user)):
    """챗봇 '마감 알림 받기' 버튼(⑬)에서 부름. 학생이 직접 만든 할 일이라 auto_key 없음."""
    t = db.one(
        """insert into todos (user_id, type, title, due_date, source_kind, source_id, reason)
           values (%s, %s, %s, %s, %s, %s, '채팅에서 알림을 받기로 한 일이에요.') returning *""",
        [uid, body.type, body.title, body.due_date, body.source and body.source.kind, body.source and body.source.id],
    )
    return _detail(t)


class TodoPatch(BaseModel):
    done: bool


@router.patch("/todos/{todo_id}")
def patch_todo(todo_id: int, body: TodoPatch, uid: str = Depends(current_user)):
    t = db.one("update todos set done = %s, done_at = case when %s then now() end where id = %s and user_id = %s returning *",
               [body.done, body.done, todo_id, uid])
    if not t:
        raise not_found("할 일")
    if body.done and t["type"] == "scholarship" and t["source_kind"] == "notice":
        # 신청 내역(S-3)에 기록 → 같은 장학 알림이 다시 오지 않음
        db.run("insert into scholarship_applications (user_id, notice_id) values (%s, %s) on conflict do nothing",
               [uid, t["source_id"]])
    if body.done and t["type"] == "graduation":
        db.run("""update profiles set completed_requirements = array_append(completed_requirements, %s)
                  where user_id = %s and not (%s = any(completed_requirements))""", [t["title"], uid, t["title"]])
    agent.recalc(uid)
    return _detail(t)
