from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Path, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from server.auth import AuthenticatedUser, require_user
from server.database import all_grade_rows, database_rows
from server.errors import APIError
from server.logic.grades import grouped_grades

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


async def mutation_result(row: dict):
    # 아직 졸업 기준·장학 판정기가 없다. 확인되지 않은 결과를 0 또는 충족으로 만들지 않는다.
    # API 공통 약속대로 미확정 값은 null. 실제 재계산 연결 후 숫자로 반환한다.
    return {"item": {key: row[key] for key in ("id", "term", "course_name", "credits", "grade", "area")},
            "recalculated": {"remaining_total": None, "new_eligible_scholarships": None}}


@router.post("/grades")
async def create_grade(body: GradeInput, request: Request, user: AuthenticatedUser = Depends(require_user)):
    rows = await database_rows(request, "POST", "grades", headers={"Prefer": "return=representation"},
                               json={**body.database_value(), "user_id": str(user.id)})
    if not rows:
        raise APIError(500, "DATABASE_ERROR", "저장 결과를 확인할 수 없어요.")
    return await mutation_result(rows[0])


@router.put("/grades/{grade_id}")
async def update_grade(body: GradeInput, request: Request, grade_id: int = Path(gt=0), user: AuthenticatedUser = Depends(require_user)):
    rows = await database_rows(request, "PATCH", "grades", params={"id": f"eq.{grade_id}", "user_id": f"eq.{user.id}"},
                               headers={"Prefer": "return=representation"}, json=body.database_value())
    if not rows:
        raise APIError(404, "GRADE_NOT_FOUND", "성적 항목을 찾을 수 없어요.")
    return await mutation_result(rows[0])


@router.delete("/grades/{grade_id}")
async def delete_grade(request: Request, grade_id: int = Path(gt=0), user: AuthenticatedUser = Depends(require_user)):
    rows = await database_rows(request, "DELETE", "grades", params={"id": f"eq.{grade_id}", "user_id": f"eq.{user.id}"},
                               headers={"Prefer": "return=representation"})
    if not rows:
        raise APIError(404, "GRADE_NOT_FOUND", "성적 항목을 찾을 수 없어요.")
    return await mutation_result(rows[0])
