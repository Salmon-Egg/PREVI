"""성적(L-8 ~ L-10) · 시간표(L-3 ~ L-7). 바뀌면 비서를 다시 계산합니다."""
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

import agent
import db
from auth import current_user
from db import Json
from errors import ApiError, not_found
from logic.grades import by_term, last_term
from logic.schedule import credit_limit, find_conflict

router = APIRouter()
Grade = Literal["A+", "A0", "B+", "B0", "C+", "C0", "D+", "D0", "F", "P"]


# ── 성적 ─────────────────────────────────────────────────
class GradeIn(BaseModel):
    term: str = Field(pattern=r"^[1-6]-[12]$")
    course_name: str = Field(min_length=1)
    credits: int = Field(ge=0, le=9)
    grade: Grade
    area: str


@router.get("/grades")
def list_grades(uid: str = Depends(current_user)):
    return by_term(agent.grades_of(uid))


@router.post("/grades", status_code=201)
def add_grade(body: GradeIn, uid: str = Depends(current_user)):
    item = db.one("insert into grades (user_id, term, course_name, credits, grade, area) values (%s, %s, %s, %s, %s, %s) "
                  "returning id, term, course_name, credits, grade, area",
                  [uid, body.term, body.course_name, body.credits, body.grade, body.area])
    return {"item": item, "recalculated": agent.recalc(uid)}


@router.put("/grades/{grade_id}")
def edit_grade(grade_id: int, body: GradeIn, uid: str = Depends(current_user)):
    item = db.one("update grades set term = %s, course_name = %s, credits = %s, grade = %s, area = %s "
                  "where id = %s and user_id = %s returning id, term, course_name, credits, grade, area",
                  [body.term, body.course_name, body.credits, body.grade, body.area, grade_id, uid])
    if not item:
        raise not_found("성적")
    return {"item": item, "recalculated": agent.recalc(uid)}


@router.delete("/grades/{grade_id}")
def delete_grade(grade_id: int, uid: str = Depends(current_user)):
    item = db.one("delete from grades where id = %s and user_id = %s returning id", [grade_id, uid])
    if not item:
        raise not_found("성적")
    return {"item": item, "recalculated": agent.recalc(uid)}


# ── 시간표 ───────────────────────────────────────────────
class Time(BaseModel):
    day: Literal["월", "화", "수", "목", "금", "토"]
    start: str = Field(pattern=r"^\d{2}:\d{2}$")
    end: str = Field(pattern=r"^\d{2}:\d{2}$")


class TimetableIn(BaseModel):
    course_id: int | None = None  # 과목 검색으로 추가
    course_name: str | None = None  # 또는 직접 입력
    credits: int | None = Field(default=None, ge=0, le=9)
    times: list[Time] | None = None


@router.get("/timetable")
def list_timetable(uid: str = Depends(current_user)):
    return db.all_rows("select id, course_id, course_name, credits, times from timetable where user_id = %s order by id", [uid])


@router.post("/timetable", status_code=201)
def add_timetable(body: TimetableIn, uid: str = Depends(current_user)):
    if body.course_id:
        c = db.one("select id, name, credits, times from courses where id = %s", [body.course_id])
        if not c:
            raise not_found("과목")
        name, credits, times = c["name"], c["credits"], c["times"]
    elif body.course_name and body.credits is not None and body.times:
        name, credits, times = body.course_name, body.credits, [t.model_dump() for t in body.times]
    else:
        raise ApiError(400, "BAD_REQUEST", "과목을 고르거나 과목명·학점·시간을 입력해 주세요")

    entries = list_timetable(uid)
    conflict = find_conflict(times, entries)
    if conflict:
        raise ApiError(409, "TIME_CONFLICT", f"{conflict}과(와) 시간이 겹쳐요")
    limit = credit_limit(last_term(agent.grades_of(uid))[0])
    total = sum(e["credits"] for e in entries) + credits
    if total > limit:
        raise ApiError(409, "CREDIT_LIMIT", f"이번 학기 최대 {limit}학점까지 신청할 수 있어요 (지금 {total}학점)")

    row = db.one("insert into timetable (user_id, course_id, course_name, credits, times) values (%s, %s, %s, %s, %s) "
                 "returning id, course_id, course_name, credits, times",
                 [uid, body.course_id, name, credits, Json(times)])
    agent.recalc(uid)
    return row


@router.delete("/timetable/{entry_id}", status_code=204)
def delete_timetable(entry_id: int, uid: str = Depends(current_user)):
    if not db.one("delete from timetable where id = %s and user_id = %s returning id", [entry_id, uid]):
        raise not_found("시간표 과목")
    agent.recalc(uid)
