"""실제 졸업 점검·재계산 검사. 기존 기준과 사용자는 변경하지 않는다."""
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
    admin = {"apikey": secret, "Authorization": f"Bearer {secret}"}
    user_id = None
    with httpx.Client(base_url=settings.supabase_url, timeout=20) as remote:
        response = remote.get("/rest/v1/grad_requirements", headers=admin, params={"select": "department,admission_year,total_credits", "order": "department,admission_year"})
        check(response.status_code == 200, "graduation rules table available")
        expected = {("소프트웨어학과", year) for year in range(2021, 2025)} | {("전자컴퓨터공학과", year) for year in (2023, 2024)}
        rules = response.json()
        check(expected <= {(row["department"], row["admission_year"]) for row in rules}, "six expected department/year rules installed")
        check(all(row["total_credits"] == 120 for row in rules if (row["department"], row["admission_year"]) in expected), "verified cohorts use 120 credits")
        try:
            email = f"codex-grad-check-{uuid4().hex}@skuniv.ac.kr"
            password = secrets.token_urlsafe(32)
            response = remote.post("/auth/v1/admin/users", headers=admin, json={"email": email, "password": password, "email_confirm": True})
            check(response.status_code in (200, 201), "temporary account created without sending email")
            user_id = response.json()["id"]
            response = remote.post("/auth/v1/token", params={"grant_type": "password"}, headers={"apikey": settings.publishable_key}, json={"email": email, "password": password})
            check(response.status_code == 200, "temporary account login")
            token = response.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            with TestClient(create_app(settings)) as app:
                check(app.get("/graduation").status_code == 401, "graduation API requires login")
                response = app.put("/me", headers=headers, json={"department": "소프트웨어학과", "admission_year": 2023, "consent": {"agreed": True}})
                check(response.status_code == 200, "software 2023 profile saved")
                response = app.get("/graduation", headers=headers)
                check(response.status_code == 200 and response.json()["remaining_total"] == 120, "empty grades leave 120 credits")
                check(any(row["done"] is None for row in response.json()["requirements"]), "manual requirements remain unknown")
                check(not any(any(word in row["name"] for word in ("CREOS", "TOEIC")) for row in response.json()["requirements"]), "abolished requirements absent")

                data = {"term": "2-2", "course_name": "운영체제", "credits": 3, "grade": "A0", "area": "전공"}
                response = app.post("/grades", headers=headers, json=data)
                check(response.status_code == 200 and response.json()["recalculated"]["remaining_total"] == 117, "saving grade recalculates remaining credits")
                grade_id = response.json()["item"]["id"]
                response = app.get("/graduation", headers=headers)
                check(any(row["name"] == "운영체제" and row["done"] is True for row in response.json()["requirements"]), "required course detected")
                response = app.put(f"/grades/{grade_id}", headers=headers, json={**data, "grade": "F"})
                check(response.status_code == 200 and response.json()["recalculated"]["remaining_total"] == 120, "failed grade removes earned credits")
                response = app.put(f"/grades/{grade_id}", headers=headers, json={**data, "grade": "P"})
                check(response.status_code == 200 and response.json()["recalculated"]["remaining_total"] == 117, "P earns credits")
                response = app.delete(f"/grades/{grade_id}", headers=headers)
                check(response.status_code == 200 and response.json()["recalculated"]["remaining_total"] == 120, "grade deletion recalculates credits")

                check(app.put("/me", headers=headers, json={"department": "전자컴퓨터공학과", "admission_year": 2024}).status_code == 200, "electronic computer profile saved")
                response = app.get("/graduation", headers=headers)
                names = {row["name"] for row in response.json()["requirements"]}
                check(response.status_code == 200 and {"C프로그래밍", "논리회로", "컴퓨터구조", "인공지능기초"} <= names, "department change uses electronic computer rules")
                check(app.put("/me", headers=headers, json={"admission_year": 2022}).status_code == 200, "older cohort selected")
                response = app.get("/graduation", headers=headers)
                check(response.status_code == 404 and response.json()["error"]["code"] == "GRADUATION_RULES_NOT_FOUND", "unknown pre-merger cohort not guessed")
                check(app.put("/me", headers=headers, json={"admission_year": 2024, "minor": "경영학과"}).status_code == 200, "minor profile saved")
                check(app.get("/graduation", headers=headers).status_code == 409, "minor curriculum requires review")

            db_headers = {"apikey": settings.publishable_key, **headers}
            response = remote.patch("/rest/v1/grad_requirements", headers=db_headers, params={"department": "eq.소프트웨어학과", "admission_year": "eq.2023"}, json={"total_credits": 1})
            check(response.status_code in (401, 403), "students cannot edit graduation criteria")
            response = remote.get("/rest/v1/grad_requirements", headers={"apikey": settings.publishable_key})
            check(response.status_code in (401, 403), "anonymous criteria access blocked")
        finally:
            if user_id is not None:
                response = remote.delete(f"/auth/v1/admin/users/{user_id}", headers=admin)
                check(response.status_code in (200, 204), "temporary account deleted")
                for table in ("profiles", "grades"):
                    response = remote.get(f"/rest/v1/{table}", headers=admin, params={"user_id": f"eq.{user_id}", "select": "id"})
                    check(response.status_code == 200 and response.json() == [], f"temporary {table} removed")


if __name__ == "__main__":
    main()
