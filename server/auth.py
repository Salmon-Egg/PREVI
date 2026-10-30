from datetime import datetime
import re
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
    email_confirmed_at: datetime | None = None


def validate_school_user(user: AuthenticatedUser):
    email = (user.email or "").lower()
    if re.fullmatch(r"[^@\s]+@skuniv\.ac\.kr", email) is None:
        raise APIError(401, "SCHOOL_EMAIL_REQUIRED", "@skuniv.ac.kr 학교 이메일로 로그인해 주세요.")
    if user.email_confirmed_at is None:
        raise APIError(401, "EMAIL_NOT_VERIFIED", "학교 이메일 인증을 완료해 주세요.")


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
        user = AuthenticatedUser.model_validate(response.json())
    except (ValueError, ValidationError):
        raise APIError(500, "AUTH_SERVICE_INVALID_RESPONSE", "로그인 확인 응답을 처리할 수 없어요.") from None
    # 관리 기능으로 만든 제출용 계정만 UUID로 허용한다. 일반 가입의 학교 메일 제한은 유지한다.
    if str(user.id) in settings.demo_user_ids and user.email_confirmed_at is not None:
        return user
    validate_school_user(user)
    return user


async def require_admin(request: Request, user: AuthenticatedUser = Depends(require_user)) -> AuthenticatedUser:
    """인증된 학교·제출용 계정 중 .env의 ADMIN_EMAILS에 있는 메일만."""
    if (user.email or "").lower() not in request.app.state.settings.admin_emails:
        raise APIError(403, "ADMIN_ONLY", "관리자만 쓸 수 있어요.")
    return user
