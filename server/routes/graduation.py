from fastapi import APIRouter, Depends, Request

from server.auth import AuthenticatedUser, require_user
from server.database import all_grade_rows, database_rows
from server.errors import APIError
from server.logic.graduation import calculate_graduation

router = APIRouter(tags=["졸업 요건"])


async def graduation_result(request: Request, user: AuthenticatedUser):
    profiles = await database_rows(request, "GET", "profiles", params={"user_id": f"eq.{user.id}", "select": "department,admission_year,minor,grade,semester"})
    if not profiles:
        raise APIError(404, "PROFILE_NOT_FOUND", "처음 설정에서 학과와 입학년도를 입력해 주세요.")
    profile = profiles[0]
    if not profile.get("department") or not profile.get("admission_year"):
        raise APIError(400, "PROFILE_INCOMPLETE", "졸업 점검을 위해 학과와 입학년도가 필요해요.")
    rules = await database_rows(request, "GET", "grad_requirements", params={
        "department": "eq." + profile["department"], "admission_year": "eq." + str(profile["admission_year"]),
        "select": "total_credits,areas,required_courses,certifications",
    })
    if not rules:
        raise APIError(404, "GRADUATION_RULES_NOT_FOUND", "이 학과·입학년도의 적용 졸업 기준은 확인 중이에요.")
    rows = await all_grade_rows(request, str(user.id))
    taking = []
    if profile.get("grade") and profile.get("semester"):  # 이번 학기 시간표 = 수강 중 (영역은 과목 검색으로 넣은 것만 앎)
        taking = [{"course_name": t["course_name"], "credits": t["credits"], "area": (t.get("courses") or {}).get("area")}
                  for t in await database_rows(request, "GET", "timetable", params={
                      "user_id": f"eq.{user.id}", "term": f"eq.{profile['grade']}-{profile['semester']}",
                      "select": "course_name,credits,courses(area)"})]
    result = calculate_graduation(rows, rules[0], taking)
    if profile.get('minor'):
        # 주전공의 확인된 최소 요건은 계속 보여주고, 미확인 추가전공을 완료로 판단하지 않는다.
        result['requirements'].append({'name':'확인 필요: 현재 표시는 주전공 최소 기준이며 부전공·복수전공의 추가 요건과 중복 인정은 별도 확인','done':None})
    return result


@router.get("/graduation")
async def graduation(request: Request, user: AuthenticatedUser = Depends(require_user)):
    return await graduation_result(request, user)
