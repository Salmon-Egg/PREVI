"""알림 센터 (T-4)."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

import db
from auth import current_user
from errors import not_found

router = APIRouter()
COLS = "id, type, title, target_id, read, sent_at"


@router.get("/notifications")
def list_notifications(uid: str = Depends(current_user)):
    return db.all_rows(f"select {COLS} from notifications where user_id = %s order by sent_at desc limit 100", [uid])


class ReadIn(BaseModel):
    read: bool


@router.patch("/notifications/{notification_id}")
def mark_read(notification_id: int, body: ReadIn, uid: str = Depends(current_user)):
    row = db.one(f"update notifications set read = %s where id = %s and user_id = %s returning {COLS}",
                 [body.read, notification_id, uid])
    if not row:
        raise not_found("알림")
    return row
