"""서버의 단일 알림 발송 통로. 외부 전송이 불확실하면 자동 재전송하지 않는다."""
import hashlib
import os
import re
from uuid import UUID

import httpx

from server.config import Settings

SEND_URL = "https://exp.host/--/api/v2/push/send"
RECEIPT_URL = "https://exp.host/--/api/v2/push/getReceipts"
TOKEN_PATTERN = re.compile(r"(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]")


class NotificationError(RuntimeError):
    pass


class NotificationSender:
    def __init__(self, database: httpx.AsyncClient, push: httpx.AsyncClient, *, push_enabled=False, access_token=None):
        self.database = database
        self.push = push
        self.push_enabled = push_enabled
        self.access_token = access_token

    async def update(self, notification_id, **values):
        response = await self.database.patch("/rest/v1/notifications", params={"id":f"eq.{notification_id}"},json=values)
        if response.status_code not in (200,204):
            raise NotificationError("알림 처리 상태를 저장할 수 없습니다.")

    async def clear_invalid_token(self, user_id, token_hash):
        response = await self.database.get("/rest/v1/profiles", params={"user_id":"eq."+str(user_id),"select":"push_token"})
        response.raise_for_status()
        rows = response.json()
        token = rows[0].get("push_token") if rows else None
        if token and hashlib.sha256(token.encode()).hexdigest() == token_hash:
            # 조회 뒤 새 토큰이 등록돼도 지우지 않도록 원래 토큰 값까지 조건에 포함.
            response = await self.database.patch("/rest/v1/profiles", params={"user_id":"eq."+str(user_id),"push_token":"eq."+token}, json={"push_token":None})
            response.raise_for_status()

    async def send(self, user_id: UUID, kind: str, title: str, target_id: int, event_key="once"):
        if kind not in {"notice","deadline","calendar","chat"} or not title.strip() or len(title)>200 or target_id<=0 or not event_key or len(event_key)>100:
            raise ValueError("알림 입력을 확인하세요.")
        response = await self.database.post("/rest/v1/rpc/reserve_notification", json={"p_user_id":str(user_id),"p_type":kind,"p_title":title,
            "p_target_id":target_id,"p_event_key":event_key})
        if response.status_code != 200:
            raise NotificationError("알림 예약을 저장할 수 없습니다.")
        reserved = response.json()
        if reserved.get("skipped"):
            return {"status":"skipped","reason":reserved["skipped"]}
        row = reserved["notification"]
        notification_id = row["id"]
        token = reserved.get("push_token")
        if not self.push_enabled or not token or TOKEN_PATTERN.fullmatch(token) is None:
            await self.update(notification_id,delivery_status="in_app")
            return {"status":"in_app","id":notification_id}
        fingerprint = hashlib.sha256(token.encode()).hexdigest()
        await self.update(notification_id,push_token_hash=fingerprint)
        headers = {"Authorization":"Bearer "+self.access_token} if self.access_token else {}
        try:
            result = await self.push.post(SEND_URL, headers=headers, json={"to":token,"title":title,"body":title,"sound":"default",
                "data":{"type":kind,"title":title,"target_id":target_id}})
        except httpx.RequestError:
            await self.update(notification_id,delivery_status="unknown",error_code="TRANSPORT_UNKNOWN")
            return {"status":"unknown","id":notification_id}
        if result.status_code != 200:
            status = "failed" if result.status_code in (400,401,403,413,429) else "unknown"
            await self.update(notification_id,delivery_status=status,error_code="PUSH_HTTP_"+str(result.status_code))
            return {"status":status,"id":notification_id}
        try:
            ticket = result.json()["data"]
            if not isinstance(ticket,dict): raise ValueError()
            if ticket.get("status")=="ok" and isinstance(ticket.get("id"),str) and ticket["id"]:
                await self.update(notification_id,delivery_status="accepted",push_ticket_id=ticket["id"])
                return {"status":"accepted","id":notification_id}
            if ticket.get("status")!="error": raise ValueError()
            code = (ticket.get("details") or {}).get("error", "PUSH_REJECTED")
            safe_code = code if code in {"DeviceNotRegistered","InvalidCredentials","MessageTooBig","MessageRateExceeded","MismatchSenderId"} else "PUSH_REJECTED"
            await self.update(notification_id,delivery_status="failed",error_code=safe_code)
            if safe_code=="DeviceNotRegistered": await self.clear_invalid_token(user_id,fingerprint)
            return {"status":"failed","id":notification_id}
        except (KeyError,ValueError,TypeError,AttributeError):
            await self.update(notification_id,delivery_status="unknown",error_code="INVALID_PUSH_RESPONSE")
            return {"status":"unknown","id":notification_id}

    async def check_receipt(self, notification_id: int):
        response = await self.database.get("/rest/v1/notifications",params={"id":f"eq.{notification_id}","select":"id,user_id,delivery_status,push_ticket_id,push_token_hash"})
        response.raise_for_status()
        rows = response.json()
        if not rows: return {"status":"missing"}
        row = rows[0]
        if row["delivery_status"]!="accepted" or not row["push_ticket_id"]:
            return {"status":row["delivery_status"]}
        headers = {"Authorization":"Bearer "+self.access_token} if self.access_token else {}
        result = await self.push.post(RECEIPT_URL,headers=headers,json={"ids":[row["push_ticket_id"]]})
        result.raise_for_status()
        receipt = result.json().get("data",{}).get(row["push_ticket_id"])
        if receipt is None: return {"status":"accepted"}
        if receipt.get("status")=="ok":
            await self.update(notification_id,delivery_status="delivered")
            return {"status":"delivered"}
        if receipt.get("status")!="error":
            raise NotificationError("푸시 결과 형식을 확인해야 합니다.")
        code = (receipt.get("details") or {}).get("error")
        safe_code = code if code in {"DeviceNotRegistered","InvalidCredentials","MessageTooBig","MessageRateExceeded","MismatchSenderId"} else "PUSH_REJECTED"
        await self.update(notification_id,delivery_status="failed",error_code=safe_code)
        if safe_code=="DeviceNotRegistered": await self.clear_invalid_token(row["user_id"],row["push_token_hash"])
        return {"status":"failed"}


async def send_notification(user_id: UUID, kind: str, title: str, target_id: int, event_key="once"):
    settings = Settings.from_env()
    secret = os.getenv("SUPABASE_SECRET_KEY", "").strip()
    if not secret: raise NotificationError("서버 전용 키가 필요합니다.")
    async with httpx.AsyncClient(base_url=settings.supabase_url,timeout=15,headers={"apikey":secret,"Authorization":"Bearer "+secret}) as database:
        async with httpx.AsyncClient(timeout=15) as push:
            sender = NotificationSender(database,push,push_enabled=os.getenv("PUSH_ENABLED", "false").lower()=="true", access_token=os.getenv("EXPO_ACCESS_TOKEN") or None)
            return await sender.send(user_id,kind,title,target_id,event_key)
