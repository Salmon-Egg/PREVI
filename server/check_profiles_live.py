"""명시적으로 실행하는 실제 Supabase 통합 검사. 생성한 임시 계정만 삭제한다."""
import os
import secrets
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from server.config import Settings
from server.main import create_app


def check(condition, label):
    if not condition:
        raise RuntimeError(label)
    print(f"PASS: {label}", flush=True)


def main():
    settings = Settings.from_env()
    secret = os.getenv("SUPABASE_SECRET_KEY", "").strip()
    if not secret:
        raise RuntimeError("Missing server secret key")
    created = []
    admin_headers = {"apikey": secret, "Authorization": f"Bearer {secret}"}
    with httpx.Client(base_url=settings.supabase_url, timeout=20) as remote:
        try:
            tokens = []
            for index in range(2):
                email = f"codex-profile-check-{uuid4().hex}@example.com"
                password = secrets.token_urlsafe(32)
                result = remote.post("/auth/v1/admin/users", headers=admin_headers,
                                     json={"email": email, "password": password, "email_confirm": True})
                if result.status_code not in (200, 201):
                    raise RuntimeError(f"Temporary account creation failed: HTTP {result.status_code}")
                user_id = result.json()["id"]
                created.append(user_id)
                result = remote.post("/auth/v1/token", params={"grant_type": "password"},
                                     headers={"apikey": settings.publishable_key}, json={"email": email, "password": password})
                check(result.status_code == 200, f"temporary user {index + 1} login")
                tokens.append(result.json()["access_token"])

            with TestClient(create_app(settings)) as app:
                check(app.get("/me").status_code == 401, "API rejects missing login")
                for index, token in enumerate(tokens):
                    headers = {"Authorization": f"Bearer {token}"}
                    check(app.get("/me", headers=headers).status_code == 404, "new user has no profile")
                    response = app.put("/me", headers=headers, json={"nickname": f"가상학생{index + 1}", "department": "소프트웨어학과", "grade": index + 1,
                                       "semester": 1, "admission_year": 2026, "consent": {"agreed": True}, "notify": {"notice": True}})
                    check(response.status_code == 200, f"user {index + 1} profile save (HTTP {response.status_code})")
                    result = app.get("/me", headers=headers)
                    check(result.status_code == 200 and result.json()["nickname"] == f"가상학생{index + 1}", "API reads own profile")
                    result = app.put("/me", headers=headers, json={"notify": {"time": "10:30"}})
                    check(result.status_code == 200 and result.json()["nickname"] == f"가상학생{index + 1}" and result.json()["notify"]["notice"] is True, "partial update preserves other fields")

            own_headers = {"apikey": settings.publishable_key, "Authorization": f"Bearer {tokens[0]}", "Prefer": "return=representation"}
            result = remote.get("/rest/v1/profiles", headers=own_headers, params={"select": "user_id"})
            check(result.status_code == 200 and result.json() == [{"user_id": created[0]}], "RLS hides other user's profile")
            result = remote.patch("/rest/v1/profiles", headers=own_headers, params={"user_id": f"eq.{created[1]}"}, json={"nickname": "forbidden"})
            check(result.status_code == 200 and result.json() == [], "RLS blocks editing other user's profile")
            result = remote.patch("/rest/v1/profiles", headers=own_headers, params={"user_id": f"eq.{created[0]}"}, json={"user_id": str(uuid4())})
            check(result.status_code == 403, "RLS blocks changing profile ownership")
            result = remote.get("/rest/v1/profiles", headers={"apikey": settings.publishable_key})
            check(result.status_code in (401, 403), "anonymous database access blocked")
        finally:
            failures = []
            for user_id in created:
                try:
                    result = remote.delete(f"/auth/v1/admin/users/{user_id}", headers=admin_headers)
                    if result.status_code not in (200, 204):
                        failures.append(user_id)
                except httpx.HTTPError:
                    failures.append(user_id)
            if failures:
                raise RuntimeError("Temporary accounts requiring cleanup: " + ", ".join(failures))
            if created:
                print("PASS: temporary test accounts deleted", flush=True)
                result = remote.get("/rest/v1/profiles", headers=admin_headers,
                                    params={"user_id": "in.(" + ",".join(created) + ")", "select": "user_id"})
                check(result.status_code == 200 and result.json() == [], "account deletion cascades to profiles")


if __name__ == "__main__":
    main()
