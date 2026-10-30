from decimal import Decimal
import logging
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Path, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from server.auth import AuthenticatedUser, require_user
from server.database import all_grade_rows, database_rows
from server.errors import APIError
from server.logic.grades import grouped_grades
from server.routes.graduation import graduation_result

router = APIRouter(tags=["성적·과목"])


class GradeInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    term: str = Field(pattern=r"^[1-6]-[12]$")
    course_name: str = Field(min_length=1, max_length=200)
    credits: Decimal = Field(gt=0, le=Decimal("999.9"), max_digits=4, decimal_places=1, allow_inf_nan=False)
    grade: Literal["A+", "A0", "B+", "B0", "C+", "C0", "D+", "D0", "F", "P"]
    area: str = Field(min_length=1, max_length=100)

    def database_value(self):
        return {**self.model_dump(exclude={"credits"}), "credits": float(self.credits)}


@router.get("/courses")
async def courses(request: Request, q: str = Query(default="", max_length=100),
                  user: AuthenticatedUser = Depends(require_user)):
    params = {"select": "id,name,credits,area,times", "order": "name.asc,id.asc", "limit": 100}
    if q.strip():
        # 검색어는 필터 문법이 아닌 문자열로만 사용한다.
        query = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_").replace("*", "\\*")
        params["name"] = f"ilike.%{query}%"
    return await database_rows(request, "GET", "courses", params=params)


@router.get("/grades")
async def grades(request: Request, user: AuthenticatedUser = Depends(require_user)):
    return grouped_grades(await all_grade_rows(request, str(user.id)))


async def mutation_result(row: dict, request: Request, user: AuthenticatedUser, background_tasks: BackgroundTasks):
    from server.jobs.pipeline import refresh_student
    background_tasks.add_task(refresh_student, str(user.id))
    remaining = None
    try:
        remaining = (await graduation_result(request, user))["remaining_total"]
    except APIError as exc:
        # 성적 저장은 이미 성공했다. 재계산 실패를 저장 실패로 오인시켜 재전송하게 하지 않는다.
        logging.getLogger(__name__).info("졸업 재계산 확인 필요: %s", exc.code)
    return {"item": {key: row[key] for key in ("id", "term", "course_name", "credits", "grade", "area")},
            "recalculated": {"remaining_total": remaining, "new_eligible_scholarships": None}}


@router.post("/grades")
async def create_grade(body: GradeInput, request: Request, background_tasks: BackgroundTasks, user: AuthenticatedUser = Depends(require_user)):
    rows = await database_rows(request, "POST", "grades", headers={"Prefer": "return=representation"},
                               json={**body.database_value(), "user_id": str(user.id)})
    if not rows:
        raise APIError(500, "DATABASE_ERROR", "저장 결과를 확인할 수 없어요.")
    return await mutation_result(rows[0], request, user, background_tasks)


@router.put("/grades/{grade_id}")
async def update_grade(body: GradeInput, request: Request, background_tasks: BackgroundTasks, grade_id: int = Path(gt=0), user: AuthenticatedUser = Depends(require_user)):
    rows = await database_rows(request, "PATCH", "grades", params={"id": f"eq.{grade_id}", "user_id": f"eq.{user.id}"},
                               headers={"Prefer": "return=representation"}, json=body.database_value())
    if not rows:
        raise APIError(404, "GRADE_NOT_FOUND", "성적 항목을 찾을 수 없어요.")
    return await mutation_result(rows[0], request, user, background_tasks)


@router.delete("/grades/{grade_id}")
async def delete_grade(request: Request, background_tasks: BackgroundTasks, grade_id: int = Path(gt=0), user: AuthenticatedUser = Depends(require_user)):
    rows = await database_rows(request, "DELETE", "grades", params={"id": f"eq.{grade_id}", "user_id": f"eq.{user.id}"},
                               headers={"Prefer": "return=representation"})
    if not rows:
        raise APIError(404, "GRADE_NOT_FOUND", "성적 항목을 찾을 수 없어요.")
    return await mutation_result(rows[0], request, user, background_tasks)
