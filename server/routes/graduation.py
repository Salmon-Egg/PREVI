from fastapi import APIRouter, Depends, Request

from server.auth import AuthenticatedUser, require_user
from server.database import all_grade_rows, database_rows
from server.errors import APIError
from server.logic.graduation import calculate_graduation

router = APIRouter(tags=["졸업 요건"])


async def graduation_result(request: Request, user: AuthenticatedUser):
    profiles = await database_rows(request, "GET", "profiles", params={"user_id": f"eq.{user.id}", "select": "department,admission_year,minor"})
    if not profiles:
        raise APIError(404, "PROFILE_NOT_FOUND", "처음 설정에서 학과와 입학년도를 입력해 주세요.")
    profile = profiles[0]
    if not profile.get("department") or not profile.get("admission_year"):
        raise APIError(400, "PROFILE_INCOMPLETE", "졸업 점검을 위해 학과와 입학년도가 필요해요.")
    if profile.get("minor"):
        raise APIError(409, "GRADUATION_RULES_NEED_REVIEW", "부전공·복수전공 적용 교육과정을 별도로 확인해야 해요.")
    rules = await database_rows(request, "GET", "grad_requirements", params={
        "department": "eq." + profile["department"], "admission_year": "eq." + str(profile["admission_year"]),
        "select": "total_credits,areas,required_courses,certifications",
    })
    if not rules:
        raise APIError(404, "GRADUATION_RULES_NOT_FOUND", "이 학과·입학년도의 적용 졸업 기준은 확인 중이에요.")
    rows = await all_grade_rows(request, str(user.id))
    return calculate_graduation(rows, rules[0])


@router.get("/graduation")
async def graduation(request: Request, user: AuthenticatedUser = Depends(require_user)):
    return await graduation_result(request, user)
