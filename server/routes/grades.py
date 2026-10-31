import base64
import binascii
from decimal import Decimal
import io
import logging
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Path, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from pypdf import PdfReader
from pypdf.errors import PdfReadError
from starlette.concurrency import run_in_threadpool

from server.ai import client as ai_client
from server.ai import tasks
from server.auth import AuthenticatedUser, require_user
from server.database import all_grade_rows, database_rows
from server.errors import APIError
from server.logic.grades import grouped_grades
from server.logic.transcript import clean_courses
from server.routes.lost_items import image_type
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


class TranscriptInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content_base64: str = Field(min_length=1, max_length=14_000_000)  # 파일 10MB


def _transcript_text(data: bytes) -> str:
    if data.startswith(b"%PDF"):
        try:
            return "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(data)).pages)
        except (PdfReadError, ValueError, OSError):
            raise APIError(400, "INVALID_FILE", "파일을 읽을 수 없어요. PDF인지 확인해 주세요.") from None
    mime = image_type(data)  # 사진이 아니면 여기서 400
    try:
        return ai_client.read_image(data, mime)
    except Exception:  # 비전 모델 꺼짐·시간 초과 등. 파일 내용이 로그에 남지 않게 종류만 묶어 안내
        raise APIError(503, "IMAGE_READER_UNAVAILABLE", "지금은 사진을 읽을 수 없어요. PDF로 올리거나 잠시 뒤 다시 해 주세요.") from None


@router.post("/grades/from-file")
async def grades_from_file(body: TranscriptInput, request: Request, user: AuthenticatedUser = Depends(require_user)):
    """성적증명서(PDF·사진) → 저장 전 미리보기. 파일과 읽은 글자는 저장하지 않고, 저장은 학생이 확인한 뒤 POST /grades로."""
    try:
        data = base64.b64decode(body.content_base64, validate=True)
    except (binascii.Error, ValueError):
        raise APIError(400, "INVALID_FILE", "파일을 읽을 수 없어요.") from None
    rows = await database_rows(request, "GET", "profiles", params={"user_id": f"eq.{user.id}", "select": "admission_year"})
    if not rows or not rows[0].get("admission_year"):
        raise APIError(400, "PROFILE_INCOMPLETE", "학기를 맞추려면 내 정보의 입학연도가 필요해요.")
    text = await run_in_threadpool(_transcript_text, data)
    items, dropped = clean_courses(await run_in_threadpool(tasks.read_transcript, text), rows[0]["admission_year"])
    if not items:
        raise APIError(400, "TRANSCRIPT_EMPTY", "성적을 찾지 못했어요. 글자가 선명한 파일인지 확인해 주세요. 스캔한 PDF는 사진으로 올려 주세요.")
    return {"items": items, "dropped": dropped}


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
