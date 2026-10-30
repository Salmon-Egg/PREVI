"""분실물(습득물) 게시판. 보관 장소는 습득자가 정한 질문에 맞게 답한 학생과 글쓴이만 (DB 함수 lost_item_place)."""
import base64
import binascii
import re
from datetime import date
from typing import Literal
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, Path, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from server.auth import AuthenticatedUser, bearer, require_user
from server.database import database_rows
from server.errors import APIError

router = APIRouter(tags=["분실물"])
Category = Literal["전자기기", "지갑·카드", "가방", "의류", "책·문구", "기타"]
BUCKET = "lost-items"
PUBLIC_COLUMNS = "id,created_at,user_id,title,category,place,found_on,description,image_path,question,status"


class LostItemInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=100)
    category: Category
    place: str = Field(min_length=1, max_length=100)
    found_on: date
    description: str = Field(default="", max_length=1000)
    question: str = Field(min_length=1, max_length=100)
    answer: str = Field(min_length=1, max_length=50)
    storage_place: str = Field(min_length=1, max_length=100)
    image_base64: str | None = Field(default=None, max_length=7_000_000)  # 사진 5MB


class ClaimInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    answer: str = Field(min_length=1, max_length=50)


class StatusInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    status: Literal["open", "closed"]


def image_url(request: Request, path: str | None):
    return f"{request.app.state.settings.supabase_url}/storage/v1/object/public/{BUCKET}/{path}" if path else None


def item_output(request: Request, row: dict, user_id: str):
    result = {key: row[key] for key in PUBLIC_COLUMNS.split(",") if key not in ("user_id", "image_path")}
    result["image_url"] = image_url(request, row["image_path"])
    result["mine"] = row["user_id"] == user_id
    return result


def image_type(data: bytes) -> str:
    # 확장자·클라이언트가 보낸 형식은 믿지 않고 파일 앞부분으로 확인
    if data.startswith(b"\xff\xd8\xff"): return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"): return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP": return "image/webp"
    raise APIError(400, "INVALID_IMAGE", "JPG, PNG, WEBP 사진만 올릴 수 있어요.")


async def storage(request: Request, method: str, path: str, **kwargs):
    """사용자 토큰으로 Storage 요청 (자기 폴더만 쓰기·지우기 가능한 정책을 그대로 적용)."""
    credentials = await bearer(request)
    s = request.app.state.settings
    try:
        res = await request.app.state.http.request(method, f"{s.supabase_url}/storage/v1/object/{BUCKET}/{path}",
            headers={"apikey": s.publishable_key, "Authorization": f"Bearer {credentials.credentials}", **kwargs.pop("headers", {})}, **kwargs)
    except httpx.RequestError:
        raise APIError(500, "STORAGE_UNAVAILABLE", "사진 서버에 연결할 수 없어요.") from None
    if res.status_code not in (200, 201):
        raise APIError(500, "STORAGE_ERROR", "사진을 저장하거나 지울 수 없어요.")


async def delete_user_photos(request: Request, user_id: str, secret: str):
    """계정 삭제 전에 호출. 사진은 저장소에 있어 DB cascade로 지워지지 않는다. 실패하면 계정 삭제도 멈춰 다시 시도할 수 있게 한다."""
    s = request.app.state.settings
    headers = {"apikey": secret, "Authorization": f"Bearer {secret}"}
    try:
        rows = await request.app.state.http.get(f"{s.supabase_url}/rest/v1/lost_items", headers=headers,
            params={"user_id": f"eq.{user_id}", "image_path": "not.is.null", "select": "image_path"})
        if rows.status_code == 404:  # 013 마이그레이션 전이면 지울 사진도 없음
            return
        if rows.status_code != 200:
            raise httpx.RequestError("lost_items 조회 실패")
        paths = [r["image_path"] for r in rows.json()]
        if paths:
            res = await request.app.state.http.request("DELETE", f"{s.supabase_url}/storage/v1/object/{BUCKET}", headers=headers, json={"prefixes": paths})
            if res.status_code != 200:
                raise httpx.RequestError("사진 삭제 실패")
    except httpx.RequestError:
        raise APIError(503, "ACCOUNT_DELETE_FAILED", "계정을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.") from None


async def item_row(request: Request, item_id: int):
    rows = await database_rows(request, "GET", "lost_items", params={"id": f"eq.{item_id}", "select": PUBLIC_COLUMNS})
    if not rows: raise APIError(404, "LOST_ITEM_NOT_FOUND", "분실물 글을 찾을 수 없어요.")
    return rows[0]


async def place_of(request: Request, item_id: int, answer: str | None = None):
    rows = await database_rows(request, "POST", "rpc/lost_item_place", json={"p_item": item_id, "p_answer": answer})
    if not rows: raise APIError(404, "LOST_ITEM_NOT_FOUND", "분실물 글을 찾을 수 없어요.")
    return rows[0]


@router.get("/lost-items")
async def lost_items(request: Request, category: Category | None = None, q: str = Query(default="", max_length=50),
                     status: Literal["open", "closed"] = "open", user: AuthenticatedUser = Depends(require_user)):
    params = {"select": PUBLIC_COLUMNS, "status": f"eq.{status}", "order": "id.desc", "limit": 100}
    if category: params["category"] = f"eq.{category}"
    q = re.sub(r"[,()*]", "", q).strip()  # PostgREST 필터 문법 글자는 빼고 검색
    if q: params["or"] = f"(title.ilike.*{q}*,place.ilike.*{q}*,description.ilike.*{q}*)"
    return [item_output(request, row, str(user.id)) for row in await database_rows(request, "GET", "lost_items", params=params)]


@router.get("/lost-items/{item_id}")
async def lost_item(request: Request, item_id: int = Path(gt=0), user: AuthenticatedUser = Depends(require_user)):
    result = item_output(request, await item_row(request, item_id), str(user.id))
    return {**result, **await place_of(request, item_id)}


@router.post("/lost-items")
async def create_lost_item(body: LostItemInput, request: Request, user: AuthenticatedUser = Depends(require_user)):
    values = body.model_dump(mode="json", exclude={"image_base64"})
    if body.image_base64:
        try:
            data = base64.b64decode(body.image_base64, validate=True)
        except (binascii.Error, ValueError):
            raise APIError(400, "INVALID_IMAGE", "사진을 읽을 수 없어요.") from None
        kind = image_type(data)
        values["image_path"] = f"{user.id}/{uuid4().hex}.{kind.split('/')[1]}"
        await storage(request, "POST", values["image_path"], content=data, headers={"Content-Type": kind})
    try:
        rows = await database_rows(request, "POST", "lost_items", params={"select": PUBLIC_COLUMNS},
                                   headers={"Prefer": "return=representation"}, json=values)
    except APIError:
        if values.get("image_path"): await storage(request, "DELETE", values["image_path"])  # 글 저장 실패면 사진도 지움
        raise
    if not rows: raise APIError(500, "DATABASE_ERROR", "분실물 저장 결과를 확인할 수 없어요.")
    return {**item_output(request, rows[0], str(user.id)), "storage_place": body.storage_place, "tries_left": 3}


@router.post("/lost-items/{item_id}/claim")
async def claim_lost_item(body: ClaimInput, request: Request, item_id: int = Path(gt=0), user: AuthenticatedUser = Depends(require_user)):
    result = await place_of(request, item_id, body.answer)
    if result["storage_place"] is None:
        if result["tries_left"] == 0:
            raise APIError(429, "TOO_MANY_TRIES", "3번 모두 틀려서 더 답할 수 없어요. 학생지원팀에 문의해 주세요.")
        raise APIError(400, "WRONG_ANSWER", f"답이 맞지 않아요. 남은 기회 {result['tries_left']}번")
    return result


@router.patch("/lost-items/{item_id}")
async def patch_lost_item(body: StatusInput, request: Request, item_id: int = Path(gt=0), user: AuthenticatedUser = Depends(require_user)):
    rows = await database_rows(request, "PATCH", "lost_items", params={"id": f"eq.{item_id}", "user_id": f"eq.{user.id}", "select": PUBLIC_COLUMNS},
                               headers={"Prefer": "return=representation"}, json={"status": body.status})
    if not rows: raise APIError(404, "LOST_ITEM_NOT_FOUND", "분실물 글을 찾을 수 없어요.")
    return item_output(request, rows[0], str(user.id))


@router.delete("/lost-items/{item_id}", status_code=204)
async def delete_lost_item(request: Request, item_id: int = Path(gt=0), user: AuthenticatedUser = Depends(require_user)):
    rows = await database_rows(request, "DELETE", "lost_items", params={"id": f"eq.{item_id}", "user_id": f"eq.{user.id}", "select": "image_path"},
                               headers={"Prefer": "return=representation"})
    if not rows: raise APIError(404, "LOST_ITEM_NOT_FOUND", "분실물 글을 찾을 수 없어요.")
    if rows[0]["image_path"]: await storage(request, "DELETE", rows[0]["image_path"])
