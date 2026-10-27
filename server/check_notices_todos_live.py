"""실제 공지·할 일 DB 통합 검사. 임시 가상 공지와 계정만 삭제한다."""
import os
import secrets
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from server.check_profiles_live import check
from server.config import Settings
from server.main import create_app


def main():
    settings = Settings.from_env()
    secret = os.getenv("SUPABASE_SECRET_KEY", "").strip()
    if not secret: raise RuntimeError("Missing server secret key")
    admin = {"apikey": secret, "Authorization": "Bearer " + secret}
    users, tokens = [], []
    notice_id = None
    marker = uuid4().hex
    with httpx.Client(base_url=settings.supabase_url, timeout=20) as remote:
        for table in ("notices", "eligibility", "todos", "scholarship_applications"):
            result = remote.get("/rest/v1/" + table, headers=admin, params={"select": "id", "limit": 0})
            check(result.status_code == 200, f"{table} table available")
        try:
            for index in range(2):
                email = f"codex-todo-check-{uuid4().hex}@skuniv.ac.kr"
                password = secrets.token_urlsafe(32)
                result = remote.post("/auth/v1/admin/users", headers=admin, json={"email": email, "password": password, "email_confirm": True})
                check(result.status_code in (200, 201), f"temporary account {index + 1} created without email")
                users.append(result.json()["id"])
                result = remote.post("/auth/v1/token", headers={"apikey": settings.publishable_key}, params={"grant_type": "password"}, json={"email": email, "password": password})
                check(result.status_code == 200, "temporary account login")
                tokens.append(result.json()["access_token"])
            payload = {"board_post_id": "integration-" + marker, "title": "[통합검사 전용] 가상 장학 공지", "body": "실제 장학 제도가 아닌 테스트 데이터입니다.",
                "url": "https://www.skuniv.ac.kr/notice/test-" + marker, "posted_at": "2026-10-27T09:00:00+09:00", "category": "장학"}
            result = remote.post("/rest/v1/notices", headers={**admin, "Prefer": "return=representation"}, json=payload)
            check(result.status_code == 201, "temporary pending notice saved")
            notice_id = result.json()[0]["id"]
            result = remote.post("/rest/v1/notices", params={"on_conflict": "board_post_id"},
                headers={**admin, "Prefer": "resolution=ignore-duplicates,return=representation"}, json=payload)
            check(result.status_code == 201 and result.json() == [], "duplicate notice insert ignored")
            headers = {"Authorization": "Bearer " + tokens[0]}
            other = {"Authorization": "Bearer " + tokens[1]}
            with TestClient(create_app(settings)) as app:
                check(app.get("/todos").status_code == 401, "todo API requires login")
                result = app.get(f"/notices/{notice_id}", headers=headers)
                check(result.status_code == 200 and result.json()["summary"] == [], "pending notice has no invented summary")
                check(app.get("/notices", headers=headers).json() == [], "unclassified notices not presented as personalized")
                for user_id, verdict in zip(users, ("eligible", "ineligible")):
                    result = remote.post("/rest/v1/eligibility", headers=admin,
                        json={"user_id": user_id, "notice_id": notice_id, "verdict": verdict, "reasons": ["통합 검사 전용 가상 판정"]})
                    check(result.status_code == 201, "temporary matched notice configured")
                result = app.get("/notices", headers=headers)
                check(result.status_code == 200 and [row["id"] for row in result.json()] == [notice_id], f"matching notice list works (HTTP {result.status_code})")
                check(app.get("/notices", headers=other).json() == [], "ineligible notice omitted for other user")

                data = {"title": "가상 장학 신청 체크", "type": "scholarship", "due_date": "2026-10-30", "source": {"kind": "notice", "id": notice_id}}
                result = app.post("/todos", headers=headers, json=data)
                check(result.status_code == 200, f"scholarship todo created (HTTP {result.status_code})")
                todo_id = result.json()["id"]
                check(result.json()["link"] == payload["url"], "todo link copied from notice")
                check(app.post("/todos", headers=headers, json=data).status_code == 409, "duplicate linked todo blocked")
                check(app.get("/todos", headers=other).json() == [], "other user's todos hidden")
                check(app.get(f"/todos/{todo_id}", headers=other).status_code == 404, "other user's todo detail blocked")
                check(app.patch(f"/todos/{todo_id}", headers=other, json={"done": True}).status_code == 404, "other user's completion blocked")
                result = app.patch(f"/todos/{todo_id}", headers=headers, json={"done": True})
                check(result.status_code == 200 and result.json()["done_at"] is not None, "completion timestamp assigned by DB")
                stamp = result.json()["done_at"]
                result = app.get("/scholarship-applications", headers=headers)
                check(result.status_code == 200 and len(result.json()) == 1 and result.json()[0]["notice_id"] == notice_id, "completion records application atomically")
                result = app.patch(f"/todos/{todo_id}", headers=headers, json={"done": True})
                check(result.status_code == 200 and result.json()["done_at"] == stamp, "repeated completion preserves timestamp")
                check(len(app.get("/scholarship-applications", headers=headers).json()) == 1, "repeated completion does not duplicate application")
                check(app.get("/scholarship-applications", headers=other).json() == [], "other user's application history hidden")
                result = app.patch(f"/todos/{todo_id}", headers=headers, json={"done": False})
                check(result.status_code == 200 and result.json()["done_at"] is None, "undo completion clears timestamp")
                check(app.get("/scholarship-applications", headers=headers).json() == [], "undo removes app tracking record")
                result = app.get("/todos?type=scholarship&done=false", headers=headers)
                check(result.status_code == 200 and len(result.json()) == 1, "todo filters work")
                check(app.patch(f"/todos/{todo_id}", headers=headers, json={"done": True}).status_code == 200, "recompletion succeeds")

            db_headers = {"apikey": settings.publishable_key, **headers}
            for table, content in (("eligibility", {"user_id": users[0], "notice_id": notice_id, "verdict": "eligible"}),
                                   ("scholarship_applications", {"user_id": users[0], "notice_id": notice_id})):
                result = remote.post("/rest/v1/" + table, headers=db_headers, json=content)
                check(result.status_code in (401, 403), f"student cannot forge {table}")
            result = remote.patch("/rest/v1/notices", headers=db_headers, params={"id": f"eq.{notice_id}"}, json={"title": "forbidden"})
            check(result.status_code in (401, 403), "student cannot edit public notice")
            result = remote.patch("/rest/v1/todos", headers=db_headers, params={"id": f"eq.{todo_id}"}, json={"user_id": users[1]})
            check(result.status_code in (401, 403), "student cannot change todo ownership")
            for table in ("notices", "eligibility", "todos", "scholarship_applications"):
                result = remote.get("/rest/v1/" + table, headers={"apikey": settings.publishable_key})
                check(result.status_code in (401, 403), f"anonymous {table} access blocked")
        finally:
            failures = []
            for user_id in users:
                try:
                    result = remote.delete(f"/auth/v1/admin/users/{user_id}", headers=admin)
                    if result.status_code not in (200, 204): failures.append("user " + user_id)
                except httpx.HTTPError:
                    failures.append("user " + user_id)
            if notice_id is not None:
                try:
                    result = remote.delete("/rest/v1/notices", headers=admin, params={"id": f"eq.{notice_id}"})
                    if result.status_code not in (200, 204): failures.append("notice " + str(notice_id))
                except httpx.HTTPError:
                    failures.append("notice " + str(notice_id))
            if failures: raise RuntimeError("Temporary cleanup required: " + ", ".join(failures))
            print("PASS: temporary accounts and notice deleted", flush=True)
            if users:
                for table in ("todos", "eligibility", "scholarship_applications"):
                    result = remote.get("/rest/v1/" + table, headers=admin, params={"user_id": "in.(" + ",".join(users) + ")", "select": "id"})
                    check(result.status_code == 200 and result.json() == [], f"temporary {table} removed")


if __name__ == "__main__":
    main()
