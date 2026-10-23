"""로그인 확인. 라우트에서 `uid: str = Depends(current_user)`로 씁니다."""
import time

import httpx
from fastapi import Header

import config
from errors import ApiError

_cache: dict[str, tuple[str, str, float]] = {}  # 토큰 → (user_id, email, 만료 시각)


def _verify_with_supabase(token: str) -> tuple[str, str]:
    """Supabase에 토큰을 보여 주고 누구인지 받아옴. 1분 동안 기억해 둠."""
    hit = _cache.get(token)
    if hit and hit[2] > time.time():
        return hit[0], hit[1]
    res = httpx.get(
        f"{config.SUPABASE_URL}/auth/v1/user",
        headers={"Authorization": f"Bearer {token}", "apikey": config.SUPABASE_ANON_KEY},
        timeout=10,
    )
    if res.status_code != 200:
        raise ApiError(401, "UNAUTHORIZED", "다시 로그인해 주세요")
    user = res.json()
    _cache[token] = (user["id"], user.get("email") or "", time.time() + 60)
    return user["id"], user.get("email") or ""


def current_user_with_email(authorization: str = Header(default="")) -> tuple[str, str]:
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise ApiError(401, "UNAUTHORIZED", "로그인이 필요해요")
    if config.DEV_AUTH and token.startswith("dev-"):
        return token.removeprefix("dev-"), ""
    uid, email = _verify_with_supabase(token)
    if config.ALLOWED_EMAIL_DOMAIN and not email.endswith("@" + config.ALLOWED_EMAIL_DOMAIN):
        raise ApiError(401, "UNAUTHORIZED", "학교 이메일로만 가입할 수 있어요")
    return uid, email


def current_user(authorization: str = Header(default="")) -> str:
    return current_user_with_email(authorization)[0]
