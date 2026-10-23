"""알림은 이 함수 하나로만 보냅니다 (기술 구조 5번).
기록 → 같은 알림이 있으면 멈춤 → 학생이 꺼 둔 종류면 멈춤 → Expo 푸시."""
import logging

import httpx

import config
import db

log = logging.getLogger("notify")


def send(user_id: str, type_: str, title: str, target_id: int | None, dedupe_key: str | None = None) -> bool:
    """보냈으면 True. dedupe_key를 안 주면 'type:target_id' (예: 마감 전날·당일처럼 여러 번이면 직접 지정)."""
    if type_ not in ("notice", "deadline", "calendar", "chat"):  # 아래 SQL 칸 이름에 들어가므로 꼭 확인
        raise ValueError(type_)
    profile = db.one(f"select push_token, notify_{type_} as allowed from profiles where user_id = %s", [user_id])
    if not profile or not profile["allowed"]:
        return False
    row = db.one(
        """insert into notifications (user_id, type, title, target_id, dedupe_key) values (%s, %s, %s, %s, %s)
           on conflict (user_id, dedupe_key) do nothing returning id""",
        [user_id, type_, title, target_id, dedupe_key or f"{type_}:{target_id}"],
    )
    if row is None:  # 이미 보낸 알림
        return False
    if config.PUSH_ENABLED and profile["push_token"]:
        _push(profile["push_token"], type_, title, target_id)
    return True


def _push(token: str, type_: str, title: str, target_id: int | None) -> None:
    headers = {"Authorization": f"Bearer {config.EXPO_ACCESS_TOKEN}"} if config.EXPO_ACCESS_TOKEN else {}
    try:
        httpx.post(
            "https://exp.host/--/api/v2/push/send",
            json={"to": token, "title": "서경 AI", "body": title,
                  "data": {"type": type_, "title": title, "target_id": target_id}},  # 앱이 누르면 열 화면을 정함
            headers=headers, timeout=10,
        )
    except httpx.HTTPError as e:  # 푸시가 실패해도 알림 센터(T-4)에는 남아 있음
        log.warning("푸시 실패: %s", e)
