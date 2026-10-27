from uuid import UUID

import httpx
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ValidationError

from server.errors import APIError

bearer = HTTPBearer(auto_error=False)


class AuthenticatedUser(BaseModel):
    id: UUID
    email: str | None = None


async def require_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> AuthenticatedUser:
    if credentials is None:
        raise APIError(401, "UNAUTHORIZED", "로그인이 필요해요.")
    settings = request.app.state.settings
    try:
        response = await request.app.state.http.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={"apikey": settings.publishable_key, "Authorization": f"Bearer {credentials.credentials}"},
        )
    except httpx.RequestError:
        raise APIError(500, "AUTH_SERVICE_UNAVAILABLE", "로그인 확인 서버에 연결할 수 없어요.") from None
    if response.status_code in (401, 403):
        raise APIError(401, "UNAUTHORIZED", "로그인이 만료됐거나 올바르지 않아요. 다시 로그인해 주세요.")
    if response.status_code != 200:
        raise APIError(500, "AUTH_SERVICE_UNAVAILABLE", "지금은 로그인을 확인할 수 없어요.")
    try:
        return AuthenticatedUser.model_validate(response.json())
    except (ValueError, ValidationError):
        raise APIError(500, "AUTH_SERVICE_INVALID_RESPONSE", "로그인 확인 응답을 처리할 수 없어요.") from None
