"""사용자 토큰을 유지해 RLS를 적용하는 데이터 요청."""
import httpx
from fastapi import Request

from server.auth import bearer
from server.errors import APIError


async def database_rows(request: Request, method: str, table: str, **kwargs) -> list[dict]:
    credentials = await bearer(request)
    if credentials is None:
        raise APIError(401, "UNAUTHORIZED", "로그인이 필요해요.")
    settings = request.app.state.settings
    try:
        response = await request.app.state.http.request(
            method, f"{settings.supabase_url}/rest/v1/{table}",
            headers={"apikey": settings.publishable_key,
                     "Authorization": f"Bearer {credentials.credentials}",
                     **kwargs.pop("headers", {})}, **kwargs,
        )
    except httpx.RequestError:
        raise APIError(500, "DATABASE_UNAVAILABLE", "데이터 서버에 연결할 수 없어요.") from None
    if response.status_code in (401, 403):
        raise APIError(401, "UNAUTHORIZED", "로그인 또는 접근 권한을 확인해 주세요.")
    if response.status_code == 409:
        raise APIError(409, "DUPLICATE_GRADE", "같은 학기에 같은 이름의 과목이 이미 있어요. 기존 항목을 수정해 주세요.")
    if response.status_code not in (200, 201, 204):
        raise APIError(500, "DATABASE_ERROR", "데이터를 저장하거나 가져올 수 없어요.")
    if response.status_code == 204 or not response.content:
        return []
    try:
        rows = response.json()
        if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
            raise ValueError()
        return rows
    except ValueError:
        raise APIError(500, "DATABASE_ERROR", "데이터 응답을 처리할 수 없어요.") from None


async def all_grade_rows(request: Request, user_id: str) -> list[dict]:
    # PostgREST의 기본 응답 상한으로 성적이 조용히 누락되지 않도록 페이지를 순회한다.
    rows = []
    while True:
        page = await database_rows(request, "GET", "grades", params={
            "user_id": f"eq.{user_id}", "select": "id,term,course_name,credits,grade,area",
            "order": "id.asc", "offset": len(rows), "limit": 100,
        })
        rows.extend(page)
        if not page:
            return rows
