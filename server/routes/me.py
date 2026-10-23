"""내 정보 GET·PUT·DELETE /me (M-2 ~ M-5)."""
from typing import Literal

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel

import agent
import config
import db
from auth import current_user, current_user_with_email
from errors import ApiError

router = APIRouter()


def _shape(p: dict) -> dict:
    return {
        "nickname": p["nickname"], "department": p["department"], "minor": p["minor"],
        "grade": p["grade"], "semester": p["semester"], "status": p["status"],
        "admission_year": p["admission_year"], "interests": p["interests"],
        "completed_requirements": p["completed_requirements"],
        "consent": {"agreed": p["consent_agreed_at"] is not None, "agreed_at": p["consent_agreed_at"]},
        "notify": {"notice": p["notify_notice"], "deadline": p["notify_deadline"], "calendar": p["notify_calendar"],
                   "chat": p["notify_chat"], "time": p["notify_time"].strftime("%H:%M")},
    }


@router.get("/me")
def get_me(uid: str = Depends(current_user)):
    p = agent.profile_of(uid)
    if not p:  # 앱은 이 오류를 받으면 처음 설정(M-2)으로 보냄
        raise ApiError(404, "NO_PROFILE", "처음 설정이 필요해요")
    return _shape(p)


class Consent(BaseModel):
    agreed: bool


class Notify(BaseModel):
    notice: bool | None = None
    deadline: bool | None = None
    calendar: bool | None = None
    chat: bool | None = None
    time: str | None = None  # "09:00"


class MeIn(BaseModel):
    nickname: str | None = None
    department: Literal["소프트웨어학과", "전자컴퓨터공학과"] | None = None  # 이번 범위는 2개 학과
    minor: str | None = None
    grade: int | None = None
    semester: Literal[1, 2] | None = None
    status: Literal["enrolled", "leave", "returned"] | None = None
    admission_year: int | None = None
    interests: list[str] | None = None
    consent: Consent | None = None
    notify: Notify | None = None
    push_token: str | None = None


ACADEMIC = {"department", "grade", "semester", "status", "admission_year"}
NOW = object()  # "지금 시각으로 저장" 표시


@router.put("/me")
def put_me(body: MeIn, who: tuple[str, str] = Depends(current_user_with_email)):
    uid, email = who
    sent = body.model_dump(exclude_unset=True)
    cols = {k: v for k, v in sent.items() if k not in ("consent", "notify")}
    if "consent" in sent:
        cols["consent_agreed_at"] = NOW if body.consent.agreed else None
    for k, v in (sent.get("notify") or {}).items():
        cols[f"notify_{k}"] = v

    db.run("insert into profiles (user_id, email) values (%s, %s) on conflict (user_id) do nothing", [uid, email])
    if cols:
        # 칸 이름은 위 모델에서 정한 것만 들어옴 (사용자 입력이 칸 이름이 되지 않음)
        sets = ", ".join(f"{k} = now()" if v is NOW else f"{k} = %s" for k, v in cols.items())
        db.run(f"update profiles set {sets} where user_id = %s", [v for v in cols.values() if v is not NOW] + [uid])
    if ACADEMIC & sent.keys():  # 학적이 바뀌면 비서 다시 계산 (휴학이면 복학 할 일이 생김)
        agent.recalc(uid)
    return _shape(agent.profile_of(uid))


@router.delete("/me", status_code=204)
def delete_me(uid: str = Depends(current_user)):
    """계정 삭제: 성적을 포함한 모든 데이터가 함께 지워짐 (profiles에 연결된 표는 on delete cascade)."""
    db.run("delete from profiles where user_id = %s", [uid])
    if config.SUPABASE_URL and config.SUPABASE_SERVICE_ROLE_KEY:
        httpx.delete(f"{config.SUPABASE_URL}/auth/v1/admin/users/{uid}", timeout=10,
                     headers={"apikey": config.SUPABASE_SERVICE_ROLE_KEY,
                              "Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}"})
