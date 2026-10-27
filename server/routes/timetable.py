from decimal import Decimal

from fastapi import APIRouter, Depends, Path, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from server.auth import AuthenticatedUser, require_user
from server.database import database_rows
from server.errors import APIError
from server.logic.timetable import ClassTime, validate_slots

router = APIRouter(tags=["시간표"])


class TimetableInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    course_id: int | None = Field(default=None, gt=0)
    course_name: str | None = Field(default=None, min_length=1, max_length=200)
    credits: Decimal | None = Field(default=None, gt=0, le=Decimal("999.9"), max_digits=4, decimal_places=1, allow_inf_nan=False)
    times: list[ClassTime] | None = Field(default=None, min_length=1, max_length=21)

    @model_validator(mode="after")
    def input_mode(self):
        if self.course_id is not None:
            if any(name in self.model_fields_set for name in ("course_name", "credits", "times")):
                raise ValueError("과목 선택과 직접 입력을 섞을 수 없습니다.")
        elif self.course_name is None or self.credits is None or self.times is None:
            raise ValueError("직접 입력은 과목명·학점·수업 시간이 필요합니다.")
        if self.times:
            validate_slots(self.times)
        return self


def output(row: dict):
    return {key: row[key] for key in ("id", "course_name", "credits", "times")}


async def current_term(request: Request, user: AuthenticatedUser):
    rows = await database_rows(request, "GET", "profiles", params={"user_id": f"eq.{user.id}", "select": "grade,semester"})
    if not rows or not rows[0].get("grade") or not rows[0].get("semester"):
        raise APIError(400, "PROFILE_INCOMPLETE", "시간표를 사용하려면 내 정보의 학년과 학기를 입력해 주세요.")
    return f"{rows[0]['grade']}-{rows[0]['semester']}"


@router.get("/timetable")
async def timetable(request: Request, user: AuthenticatedUser = Depends(require_user)):
    term = await current_term(request, user)
    rows = await database_rows(request, "GET", "timetable", params={"user_id": f"eq.{user.id}", "term": "eq." + term,
        "select": "id,course_name,credits,times", "order": "id.asc", "limit": 500})
    return [output(row) for row in rows]


@router.post("/timetable")
async def add_timetable(body: TimetableInput, request: Request, user: AuthenticatedUser = Depends(require_user)):
    term = await current_term(request, user)
    if body.course_id is not None:
        courses = await database_rows(request, "GET", "courses", params={"id": f"eq.{body.course_id}", "select": "id,name,credits,times"})
        if not courses:
            raise APIError(404, "COURSE_NOT_FOUND", "과목을 찾을 수 없어요.")
        course = courses[0]
        try:
            checked = TimetableInput(course_name=course["name"], credits=course["credits"], times=course["times"])
        except (ValidationError, KeyError):
            raise APIError(400, "INVALID_COURSE_TIMES", "이 과목의 학점·수업 시간 정보는 확인이 필요해요.") from None
        values = {"course_id": body.course_id, "course_name": checked.course_name,
                  "credits": float(checked.credits), "times": [slot.model_dump() for slot in checked.times]}
    else:
        values = {"course_name": body.course_name, "credits": float(body.credits), "times": [slot.model_dump() for slot in body.times]}
    # 시간 중복·합계 상한은 DB 잠금 안에서 검사해 동시 요청도 우회하지 못하게 한다.
    rows = await database_rows(request, "POST", "timetable", headers={"Prefer": "return=representation"},
        json={**values, "user_id": str(user.id), "term": term})
    if not rows:
        raise APIError(500, "DATABASE_ERROR", "시간표 저장 결과를 확인할 수 없어요.")
    return output(rows[0])


@router.delete("/timetable/{item_id}")
async def delete_timetable(request: Request, item_id: int = Path(gt=0), user: AuthenticatedUser = Depends(require_user)):
    rows = await database_rows(request, "DELETE", "timetable", params={"id": f"eq.{item_id}", "user_id": f"eq.{user.id}"},
        headers={"Prefer": "return=representation"})
    if not rows:
        raise APIError(404, "TIMETABLE_NOT_FOUND", "시간표 항목을 찾을 수 없어요.")
    return output(rows[0])
