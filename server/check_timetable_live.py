"""실제 DB 시간표·동시 요청 검사. 생성한 임시 계정과 과목만 정리한다."""
from concurrent.futures import ThreadPoolExecutor
import os
import secrets
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from server.check_profiles_live import check
from server.config import Settings
from server.main import create_app


def entry(name, credits=3, day="월", start="09:00", end="10:00"):
    return {"course_name": name, "credits": credits, "times": [{"day": day, "start": start, "end": end}]}


def main():
    settings = Settings.from_env()
    secret = os.getenv("SUPABASE_SECRET_KEY", "").strip()
    if not secret:
        raise RuntimeError("Missing server secret key")
    admin = {"apikey": secret, "Authorization": f"Bearer {secret}"}
    users = []
    tokens = []
    course_id = None
    with httpx.Client(base_url=settings.supabase_url, timeout=20) as remote:
        response = remote.get("/rest/v1/timetable", headers=admin, params={"select": "id", "limit": 0})
        check(response.status_code == 200, "timetable table available")
        try:
            for index in range(2):
                email = f"codex-timetable-{uuid4().hex}@skuniv.ac.kr"
                password = secrets.token_urlsafe(32)
                response = remote.post("/auth/v1/admin/users", headers=admin, json={"email": email, "password": password, "email_confirm": True})
                check(response.status_code in (200, 201), f"temporary account {index + 1} created without email")
                users.append(response.json()["id"])
                response = remote.post("/auth/v1/token", headers={"apikey": settings.publishable_key}, params={"grant_type": "password"}, json={"email": email, "password": password})
                check(response.status_code == 200, "temporary user login")
                tokens.append(response.json()["access_token"])
            headers = {"Authorization": "Bearer " + tokens[0]}
            db_headers = {"apikey": settings.publishable_key, **headers, "Prefer": "return=representation"}

            def clear_own():
                result = remote.delete("/rest/v1/timetable", headers=db_headers, params={"user_id": "eq." + users[0]})
                check(result.status_code in (200, 204), "own temporary timetable cleared")

            with TestClient(create_app(settings)) as app:
                check(app.get("/timetable").status_code == 401, "timetable requires login")
                for token in tokens:
                    response = app.put("/me", headers={"Authorization": "Bearer " + token}, json={"department": "소프트웨어학과", "admission_year": 2023, "grade": 2, "semester": 1, "consent": {"agreed": True}})
                    check(response.status_code == 200, "temporary student profile configured")
                response = app.post("/timetable", headers=headers, json=entry("기준과목"))
                check(response.status_code == 200, f"manual timetable insert (HTTP {response.status_code})")
                item_id = response.json()["id"]
                response = app.post("/timetable", headers=headers, json=entry("중복시간", start="09:30", end="10:30"))
                check(response.status_code == 409 and response.json()["error"]["code"] == "TIME_CONFLICT", "overlapping class rejected")
                response = app.post("/timetable", headers=headers, json=entry("연속수업", start="10:00", end="11:00"))
                check(response.status_code == 200, "adjacent class accepted")
                response = app.post("/timetable", headers=headers, json=entry("기준과목", day="수"))
                check(response.status_code == 409 and response.json()["error"]["code"] == "DUPLICATE_COURSE", "duplicate course rejected")
                other = {"Authorization": "Bearer " + tokens[1]}
                check(app.get("/timetable", headers=other).json() == [], "other user cannot list timetable")
                check(app.delete(f"/timetable/{item_id}", headers=other).status_code == 404, "other user cannot delete timetable")
                check(app.get("/graduation", headers=headers).json()["earned_total"] == 0, "planned classes are not earned credits")
                check(app.put("/me", headers=headers, json={"semester": 2}).status_code == 200, "semester changed")
                check(app.get("/timetable", headers=headers).json() == [], "current semester only is listed")
                check(app.put("/me", headers=headers, json={"semester": 1}).status_code == 200, "test semester restored")
                check(len(app.get("/timetable", headers=headers).json()) == 2, "previous plan preserved on semester change")
                check(app.delete(f"/timetable/{item_id}", headers=headers).status_code == 200, "own class can be deleted")
                clear_own()

                response = app.post("/timetable", headers=headers, json=entry("19학점경계", credits=19))
                check(response.status_code == 200, "base credit cap boundary accepted")
                response = app.post("/timetable", headers=headers, json=entry("초과", credits=1, day="수"))
                check(response.status_code == 409 and response.json()["error"]["code"] == "CREDIT_LIMIT", "base credit cap exceeded rejected")
                clear_own()
                grade = {"term": "1-2", "course_name": "가상 이전학기 과목", "credits": 3, "grade": "A+", "area": "전공"}
                response = app.post("/grades", headers=headers, json=grade)
                check(response.status_code == 200, "previous semester test grade created")
                grade_id = response.json()["item"]["id"]
                check(app.post("/timetable", headers=headers, json=entry("추가학점경계", credits=22)).status_code == 200, "high GPA bonus credits accepted")
                check(app.post("/timetable", headers=headers, json=entry("추가학점초과", credits=1, day="수")).status_code == 409, "bonus credit cap enforced")
                clear_own()
                check(app.put(f"/grades/{grade_id}", headers=headers, json={**grade, "grade": "D0"}).status_code == 200, "low GPA test grade configured")
                check(app.post("/timetable", headers=headers, json=entry("주의학점경계", credits=15)).status_code == 200, "low GPA conservative cap accepted")
                check(app.post("/timetable", headers=headers, json=entry("주의학점초과", credits=1, day="수")).status_code == 409, "low GPA conservative cap enforced")
                clear_own()
                check(app.delete(f"/grades/{grade_id}", headers=headers).status_code == 200, "test GPA removed")

                response = remote.post("/rest/v1/courses", headers={**admin, "Prefer": "return=representation"}, json={"name": "시간표검증_" + uuid4().hex, "credits": 3, "area": "전공", "times": entry("x")["times"]})
                check(response.status_code == 201, "temporary catalog course created")
                course_id = response.json()[0]["id"]
                response = app.post("/timetable", headers=headers, json={"course_id": course_id})
                check(response.status_code == 200 and response.json()["credits"] == 3, "catalog course can be selected")
                clear_own()

            # 직접 DB 요청도 course_id의 실제 학점·시간을 사용해야 한다.
            response = remote.post("/rest/v1/timetable", headers=db_headers, json={**entry("위조", credits=1, day="금"), "course_id": course_id, "user_id": users[0], "term": "6-2"})
            check(response.status_code == 201 and response.json()[0]["credits"] == 3 and response.json()[0]["term"] == "2-1", "DB prevents forged course credits and semester")
            clear_own()

            def direct_add(data):
                return httpx.post(settings.supabase_url + "/rest/v1/timetable", headers=db_headers, json={**data, "user_id": users[0], "term": "2-1"}, timeout=20).status_code

            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(direct_add, [entry("동시상한A", credits=10), entry("동시상한B", credits=10, day="수")]))
            check(sorted(results) == [201, 400], "concurrent inserts cannot bypass credit cap")
            clear_own()
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(direct_add, [entry("동시시간A"), entry("동시시간B")]))
            check(sorted(results) == [201, 400], "concurrent inserts cannot bypass time overlap")

            response = remote.post("/rest/v1/timetable", headers=db_headers, json={**entry("타인삽입", day="목"), "user_id": users[1], "term": "2-1"})
            check(response.status_code in (400, 401, 403), "cannot insert timetable for another user")
            response = remote.get("/rest/v1/timetable", headers={"apikey": settings.publishable_key})
            check(response.status_code in (401, 403), "anonymous timetable access blocked")
        finally:
            failures = []
            for user_id in users:
                try:
                    result = remote.delete(f"/auth/v1/admin/users/{user_id}", headers=admin)
                    if result.status_code not in (200, 204): failures.append("user " + user_id)
                except httpx.HTTPError:
                    failures.append("user " + user_id)
            if course_id is not None:
                try:
                    result = remote.delete("/rest/v1/courses", headers=admin, params={"id": f"eq.{course_id}"})
                    if result.status_code not in (200, 204): failures.append("course " + str(course_id))
                except httpx.HTTPError:
                    failures.append("course " + str(course_id))
            if failures:
                raise RuntimeError("Temporary cleanup required: " + ", ".join(failures))
            print("PASS: temporary accounts and course deleted", flush=True)
            if users:
                for table in ("profiles", "grades", "timetable"):
                    response = remote.get(f"/rest/v1/{table}", headers=admin, params={"user_id": "in.(" + ",".join(users) + ")", "select": "id"})
                    check(response.status_code == 200 and response.json() == [], f"temporary {table} removed")


if __name__ == "__main__":
    main()
