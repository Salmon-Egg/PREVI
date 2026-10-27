"""실제 Supabase 과목·성적 검사. 임시 계정과 임시 과목만 생성·정리한다."""
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
    if not secret:
        raise RuntimeError("Missing server secret key")
    admin_headers = {"apikey": secret, "Authorization": f"Bearer {secret}"}
    created = []
    course_id = None
    course_name = f"검증용_과목_{uuid4().hex}"
    with httpx.Client(base_url=settings.supabase_url, timeout=20) as remote:
        # 표가 없으면 계정을 만들기 전에 중단한다.
        for table in ("courses", "grades"):
            response = remote.get(f"/rest/v1/{table}", headers=admin_headers, params={"select": "id", "limit": 0})
            check(response.status_code == 200, f"{table} table available (HTTP {response.status_code})")
        try:
            tokens = []
            for index in range(2):
                email = f"codex-grade-check-{uuid4().hex}@skuniv.ac.kr"
                password = secrets.token_urlsafe(32)
                response = remote.post("/auth/v1/admin/users", headers=admin_headers,
                                       json={"email": email, "password": password, "email_confirm": True})
                check(response.status_code in (200, 201), f"temporary user {index + 1} created")
                created.append(response.json()["id"])
                response = remote.post("/auth/v1/token", params={"grant_type": "password"}, headers={"apikey": settings.publishable_key},
                                       json={"email": email, "password": password})
                check(response.status_code == 200, f"temporary user {index + 1} login")
                tokens.append(response.json()["access_token"])

            response = remote.post("/rest/v1/courses", headers={**admin_headers, "Prefer": "return=representation"},
                                   json={"name": course_name, "credits": 3, "area": "전공", "times": [{"day": "화", "start": "10:30", "end": "12:00"}]})
            check(response.status_code == 201, "temporary course created")
            course_id = response.json()[0]["id"]

            grade_ids = []
            data = {"term": "2-1", "course_name": "가상 자료구조", "credits": 3, "grade": "A+", "area": "전공"}
            with TestClient(create_app(settings)) as app:
                check(app.get("/grades").status_code == 401, "grades API requires login")
                for index, token in enumerate(tokens):
                    headers = {"Authorization": f"Bearer {token}"}
                    response = app.post("/grades", headers=headers, json=data)
                    check(response.status_code == 200, f"user {index + 1} saves own grade")
                    grade_ids.append(response.json()["item"]["id"])
                    response = app.get("/grades", headers=headers)
                    check(response.status_code == 200 and len(response.json()) == 1 and response.json()[0]["gpa"] == 4.5, "grade listing and GPA calculation")

                headers = {"Authorization": f"Bearer {tokens[0]}"}
                response = app.post("/grades", headers=headers, json=data)
                check(response.status_code == 409, "duplicate grade blocked")
                response = app.put(f"/grades/{grade_ids[0]}", headers=headers, json={**data, "grade": "B0"})
                check(response.status_code == 200 and response.json()["item"]["grade"] == "B0", "own grade update")
                response = app.get("/grades", headers=headers)
                check(response.status_code == 200 and response.json()[0]["gpa"] == 3.0, "GPA changes after update")
                check(app.put(f"/grades/{grade_ids[1]}", headers=headers, json=data).status_code == 404, "API blocks other user's grade update")
                check(app.delete(f"/grades/{grade_ids[1]}", headers=headers).status_code == 404, "API blocks other user's grade deletion")
                response = app.get("/courses", headers=headers, params={"q": course_name})
                check(response.status_code == 200 and [row["id"] for row in response.json()] == [course_id], "course search")
                check(app.delete(f"/grades/{grade_ids[0]}", headers=headers).status_code == 200, "own grade deletion")
                check(app.get("/grades", headers=headers).json() == [], "deleted grade is absent")

            # API의 필터를 거치지 않고 DB에 직접 접근해도 타인 데이터는 차단되어야 한다.
            headers = {"apikey": settings.publishable_key, "Authorization": f"Bearer {tokens[0]}", "Prefer": "return=representation"}
            response = remote.get("/rest/v1/grades", headers=headers)
            check(response.status_code == 200 and response.json() == [], "RLS hides other user's remaining grade")
            response = remote.patch("/rest/v1/grades", headers=headers, params={"id": f"eq.{grade_ids[1]}"}, json={"grade": "F"})
            check(response.status_code == 200 and response.json() == [], "RLS blocks direct update")
            response = remote.delete("/rest/v1/grades", headers=headers, params={"id": f"eq.{grade_ids[1]}"})
            check(response.status_code == 200 and response.json() == [], "RLS blocks direct deletion")
            response = remote.post("/rest/v1/grades", headers=headers, json={**data, "user_id": created[1], "course_name": "차단검사"})
            check(response.status_code == 403, "RLS blocks inserting grade for other user")
            response = remote.patch("/rest/v1/courses", headers=headers, params={"id": f"eq.{course_id}"}, json={"name": "forbidden"})
            check(response.status_code in (401, 403), "ordinary users cannot edit courses")
            for table in ("grades", "courses"):
                response = remote.get(f"/rest/v1/{table}", headers={"apikey": settings.publishable_key})
                check(response.status_code in (401, 403), f"anonymous {table} access blocked")
        finally:
            failures = []
            for user_id in created:
                try:
                    response = remote.delete(f"/auth/v1/admin/users/{user_id}", headers=admin_headers)
                    if response.status_code not in (200, 204):
                        failures.append(f"user {user_id}")
                except httpx.HTTPError:
                    failures.append(f"user {user_id}")
            if course_id is not None:
                try:
                    response = remote.delete("/rest/v1/courses", headers=admin_headers, params={"id": f"eq.{course_id}"})
                    if response.status_code not in (200, 204):
                        failures.append(f"course {course_id}")
                except httpx.HTTPError:
                    failures.append(f"course {course_id}")
            if failures:
                raise RuntimeError("Temporary data requiring cleanup: " + ", ".join(failures))
            print("PASS: temporary accounts and course removed", flush=True)
            if created:
                response = remote.get("/rest/v1/grades", headers=admin_headers,
                                       params={"user_id": "in.(" + ",".join(created) + ")", "select": "id"})
                check(response.status_code == 200 and response.json() == [], "account deletion cascades to grades")


if __name__ == "__main__":
    main()
