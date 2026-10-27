"""실제 DB 홈 집계 검사. 기존 학사일정·사용자·공지에는 쓰지 않는다."""
from datetime import datetime, timedelta
import os
import secrets
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from server.check_profiles_live import check
from server.config import Settings
from server.main import create_app
from server.routes.todos import KST


def main():
    settings = Settings.from_env()
    secret = os.getenv("SUPABASE_SECRET_KEY", "").strip()
    if not secret: raise RuntimeError("Missing server secret key")
    admin = {"apikey": secret, "Authorization": "Bearer " + secret}
    users, tokens, events = [], [], []
    notice_id = None
    today = datetime.now(KST).date()
    marker = uuid4().hex
    with httpx.Client(base_url=settings.supabase_url, timeout=20) as remote:
        response = remote.get("/rest/v1/academic_calendar", headers=admin, params={"select": "id", "limit": 10})
        check(response.status_code == 200 and len(response.json()) >= 8, "initial calendar events installed")
        try:
            for index in range(2):
                email = f"codex-home-{uuid4().hex}@skuniv.ac.kr"
                password = secrets.token_urlsafe(32)
                response = remote.post("/auth/v1/admin/users", headers=admin, json={"email": email, "password": password, "email_confirm": True})
                check(response.status_code in (200, 201), f"temporary account {index + 1} created without email")
                users.append(response.json()["id"])
                response = remote.post("/auth/v1/token", headers={"apikey": settings.publishable_key}, params={"grant_type": "password"}, json={"email": email, "password": password})
                check(response.status_code == 200, "temporary user login")
                tokens.append(response.json()["access_token"])
            for grade in (2, 4):
                response = remote.post("/rest/v1/academic_calendar", headers={**admin, "Prefer": "return=representation"},
                    json={"title": f"통합검사 전용 {grade}학년 일정 {marker}", "start_date": today.isoformat(), "end_date": today.isoformat(),
                          "target_grades": [grade], "source_url": "https://www.skuniv.ac.kr/academic-calendar"})
                check(response.status_code == 201, "temporary grade-specific calendar event created")
                events.append(response.json()[0]["id"])
            response = remote.post("/rest/v1/notices", headers={**admin, "Prefer": "return=representation"}, json={
                "board_post_id": "home-check-" + marker, "title": "[통합검사 전용] 가상 장학", "body": "실제 장학 제도가 아닙니다.",
                "url": "https://www.skuniv.ac.kr/notice/test-" + marker, "posted_at": datetime.now(KST).isoformat(), "category": "장학",
                "deadline": (datetime.now(KST) + timedelta(days=1)).isoformat()})
            check(response.status_code == 201, "temporary scholarship notice created")
            notice_id = response.json()[0]["id"]
            response = remote.post("/rest/v1/eligibility", headers=admin,
                json={"user_id": users[0], "notice_id": notice_id, "verdict": "eligible", "reasons": ["가상 통합 검사 판정"]})
            check(response.status_code == 201, "temporary personalized scholarship result created")
            headers = {"Authorization": "Bearer " + tokens[0]}
            other = {"Authorization": "Bearer " + tokens[1]}
            with TestClient(create_app(settings)) as app:
                check(app.get("/home").status_code == 401, "home requires login")
                response = app.get("/home", headers=other)
                check(response.status_code == 200 and response.json()["today_todos"] == [], "new user home works without profile")
                check(response.json()["menu_status"]["scholarship"] == "장학 자격 판정 대기", "no invented scholarship results for other user")
                check(app.put("/me", headers=headers, json={"department":"소프트웨어학과","admission_year":2023,"grade":2,"semester":1,"consent":{"agreed":True}}).status_code == 200, "profile configured")
                response = app.get("/calendar", headers=headers, params={"year":today.year})
                ids = {row["id"] for row in response.json()}
                check(response.status_code == 200 and events[0] in ids and events[1] not in ids, "calendar filters other grades")
                check(app.post("/grades", headers=headers, json={"term":"1-2","course_name":"가상과목","credits":3,"grade":"A0","area":"전공"}).status_code == 200, "test earned credits saved")
                todos = []
                for offset in range(4):
                    response = app.post("/todos", headers=headers, json={"title":f"가상 할 일 {offset}", "due_date":(today+timedelta(days=offset)).isoformat()})
                    check(response.status_code == 200, "temporary todo saved")
                    todos.append(response.json()["id"])
                response = app.get("/home", headers=headers)
                check(response.status_code == 200, f"home aggregate succeeds (HTTP {response.status_code})")
                body = response.json()
                check([row["id"] for row in body["today_todos"]] == todos[:3], "home shows top three pending todos in deadline order")
                check(body["today_todos"][0]["d_day"] == 0, "home D-day uses Korean date")
                check("117" in body["menu_status"]["study"] and "세부요건" in body["menu_status"]["study"], "home reflects earned credits with qualification reminder")
                check(body["menu_status"]["scholarship"].startswith("신청 가능 1건"), "home uses real stored scholarship result")
                check(body["menu_status"]["admin"] == "맞춤 공지 1건", "home personalized notice count")
                check(body["next_event"] is not None and len(body["suggested_questions"]) == 3, "home calendar and suggested questions populated")
                check(app.patch(f"/todos/{todos[0]}", headers=headers, json={"done":True}).status_code == 200, "first todo completed")
                check([row["id"] for row in app.get("/home", headers=headers).json()["today_todos"]] == todos[1:], "completed todo disappears from home")
                response = app.post("/todos", headers=headers, json={"title":"가상 장학 체크","type":"scholarship","source":{"kind":"notice","id":notice_id}})
                check(response.status_code == 200, "scholarship todo created")
                scholarship_todo = response.json()["id"]
                check(app.patch(f"/todos/{scholarship_todo}", headers=headers, json={"done":True}).status_code == 200, "application completion recorded")
                response = app.get("/scholarships", headers=headers)
                check(response.status_code == 200 and response.json()[0]["applied"] is True, "scholarship API reflects application")
                check(app.get("/home", headers=headers).json()["menu_status"]["scholarship"] == "신청 가능 판정 없음", "applied scholarship excluded from home count")
                check(app.patch(f"/todos/{scholarship_todo}", headers=headers, json={"done":False}).status_code == 200, "application tracking undone")
                check(app.get("/home", headers=headers).json()["menu_status"]["scholarship"].startswith("신청 가능 1건"), "undo restores eligible count")
                response = remote.patch("/rest/v1/notices", headers=admin, params={"id":f"eq.{notice_id}"}, json={"deadline":(datetime.now(KST)-timedelta(days=1)).isoformat()})
                check(response.status_code == 204, "test deadline expired")
                check(app.get("/home", headers=headers).json()["menu_status"]["scholarship"] == "신청 가능 판정 없음", "expired scholarship excluded from home count")
                check(app.get("/home", headers=other).json()["today_todos"] == [], "home data never leaks to another user")

            db_headers = {"apikey":settings.publishable_key, **headers}
            response = remote.patch("/rest/v1/academic_calendar", headers=db_headers, params={"id":f"eq.{events[0]}"}, json={"title":"forbidden"})
            check(response.status_code in (401,403), "student cannot change official calendar")
            response = remote.get("/rest/v1/academic_calendar", headers={"apikey":settings.publishable_key})
            check(response.status_code in (401,403), "anonymous calendar access blocked")
        finally:
            failures = []
            for user_id in users:
                try:
                    result = remote.delete(f"/auth/v1/admin/users/{user_id}", headers=admin)
                    if result.status_code not in (200,204): failures.append("user " + user_id)
                except httpx.HTTPError: failures.append("user " + user_id)
            for table, ids in (("notices", [notice_id] if notice_id else []), ("academic_calendar", events)):
                for item_id in ids:
                    try:
                        result = remote.delete("/rest/v1/" + table, headers=admin, params={"id":f"eq.{item_id}"})
                        if result.status_code not in (200,204): failures.append(table + " " + str(item_id))
                    except httpx.HTTPError: failures.append(table + " " + str(item_id))
            if failures: raise RuntimeError("Temporary cleanup required: " + ", ".join(failures))
            print("PASS: temporary accounts, events and notice deleted", flush=True)
            if users:
                for table in ("profiles","grades","todos","eligibility","scholarship_applications"):
                    response = remote.get("/rest/v1/" + table, headers=admin, params={"user_id":"in.("+",".join(users)+")","select":"id"})
                    check(response.status_code == 200 and response.json() == [], f"temporary {table} removed")


if __name__ == "__main__":
    main()
