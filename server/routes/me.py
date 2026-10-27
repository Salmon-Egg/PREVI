from datetime import datetime, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator

from server.auth import AuthenticatedUser, bearer, require_user
from server.errors import APIError

router = APIRouter(tags=["내 정보"])


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ConsentInput(InputModel):
    agreed: bool


class NotifyInput(InputModel):
    notice: bool | None = None
    deadline: bool | None = None
    calendar: bool | None = None
    chat: bool | None = None
    time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")

    @model_validator(mode="after")
    def reject_nulls(self):
        if any(getattr(self, name) is None for name in self.model_fields_set):
            raise ValueError("알림 값은 null일 수 없습니다.")
        return self


class ProfileInput(InputModel):
    nickname: str | None = Field(default=None, min_length=1, max_length=40)
    department: str | None = Field(default=None, min_length=1, max_length=100)
    minor: str | None = Field(default=None, min_length=1, max_length=100)
    grade: int | None = Field(default=None, ge=1, le=6)
    semester: int | None = Field(default=None, ge=1, le=2)
    status: Literal["enrolled", "leave", "returned"] | None = None
    admission_year: int | None = Field(default=None, ge=1900, le=2100)
    interests: list[str] | None = Field(default=None, max_length=30)
    consent: ConsentInput | None = None
    notify: NotifyInput | None = None
    push_token: str | None = Field(default=None, min_length=1, max_length=4096)

    @model_validator(mode="after")
    def reject_required_nulls(self):
        for name in {"status", "interests", "consent", "notify"} & self.model_fields_set:
            if getattr(self, name) is None:
                raise ValueError(f"{name}는 null일 수 없습니다.")
        return self


def profile_output(row: dict):
    fields = ("nickname", "department", "minor", "grade", "semester", "status", "admission_year", "interests")
    return {
        **{key: row[key] for key in fields},
        "consent": {"agreed": row["consent_agreed_at"] is not None, "agreed_at": row["consent_agreed_at"]},
        "notify": {**{key: row[f"notify_{key}"] for key in ("notice", "deadline", "calendar", "chat")}, "time": row["notify_time"][:5]},
    }


async def profile_request(request: Request, method: str, user: AuthenticatedUser, **kwargs):
    settings = request.app.state.settings
    credentials = await bearer(request)
    try:
        response = await request.app.state.http.request(
            method, f"{settings.supabase_url}/rest/v1/profiles",
            headers={"apikey": settings.publishable_key, "Authorization": f"Bearer {credentials.credentials}", **kwargs.pop("headers", {})},
            **kwargs,
        )
    except httpx.RequestError:
        raise APIError(500, "DATABASE_UNAVAILABLE", "데이터 서버에 연결할 수 없어요.") from None
    if response.status_code in (401, 403):
        raise APIError(401, "UNAUTHORIZED", "로그인 또는 접근 권한을 확인해 주세요.")
    if response.status_code not in (200, 201, 204):
        raise APIError(500, "DATABASE_ERROR", "내 정보를 저장하거나 가져올 수 없어요.")
    if response.status_code == 204 or not response.content:
        return []
    try:
        rows = response.json()
        if not isinstance(rows, list):
            raise ValueError()
        return rows
    except ValueError:
        raise APIError(500, "DATABASE_ERROR", "내 정보 응답을 처리할 수 없어요.") from None


@router.get("/me")
async def get_me(request: Request, user: AuthenticatedUser = Depends(require_user)):
    rows = await profile_request(request, "GET", user, params={"user_id": f"eq.{user.id}", "select": "*"})
    if not rows:
        raise APIError(404, "PROFILE_NOT_FOUND", "처음 설정을 저장해 주세요.")
    return profile_output(rows[0])


@router.put("/me")
async def put_me(body: ProfileInput, request: Request, user: AuthenticatedUser = Depends(require_user)):
    # 다른 요청이 동시에 처음 설정을 만들어도 기존 정보를 덮어쓰지 않는다.
    await profile_request(request, "POST", user, params={"on_conflict": "user_id"},
                          headers={"Prefer": "resolution=ignore-duplicates,return=minimal"}, json={"user_id": str(user.id)})
    values = body.model_dump(exclude_unset=True, exclude={"notify", "consent"})
    if body.notify is not None:
        values.update({f"notify_{key}": value for key, value in body.notify.model_dump(exclude_unset=True).items()})
    if body.consent is not None:
        values["consent_agreed_at"] = datetime.now(timezone.utc).isoformat() if body.consent.agreed else None
    if not values:
        return await get_me(request, user)
    rows = await profile_request(request, "PATCH", user, params={"user_id": f"eq.{user.id}"},
                                 headers={"Prefer": "return=representation"}, json=values)
    if not rows:
        raise APIError(404, "PROFILE_NOT_FOUND", "내 정보를 찾을 수 없어요.")
    return profile_output(rows[0])
