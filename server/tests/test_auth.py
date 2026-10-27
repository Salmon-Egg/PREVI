from uuid import uuid4

import httpx
import pytest
from fastapi import Depends
from fastapi.testclient import TestClient

from server.auth import AuthenticatedUser, require_user
from server.config import Settings
from server.main import create_app

USER_ID = str(uuid4())


def make_client(handler):
    app = create_app(Settings("https://example.supabase.co", "test-public-key"), httpx.MockTransport(handler))

    # 검증 전용 경로: 실제 API에 임시 인증 경로를 추가하지 않는다.
    @app.get("/protected")
    async def protected(user: AuthenticatedUser = Depends(require_user)):
        return {"id": str(user.id)}

    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.parametrize("header", [None, "Basic abc", "Bearer"])
def test_missing_bearer_never_calls_supabase(header):
    def handler(request):
        pytest.fail("인증 정보가 없으면 외부 요청을 보내면 안 됨")
    with make_client(handler) as client:
        response = client.get("/protected", headers={"Authorization": header} if header else {})
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_valid_token_verified_with_supabase():
    def handler(request):
        assert str(request.url) == "https://example.supabase.co/auth/v1/user"
        assert request.headers["authorization"] == "Bearer test-user-token"
        assert request.headers["apikey"] == "test-public-key"
        return httpx.Response(200, json={"id": USER_ID, "email": "student@example.com"})
    with make_client(handler) as client:
        response = client.get("/protected", headers={"Authorization": "Bearer test-user-token"})
        assert response.status_code == 200
        assert response.json() == {"id": USER_ID}


@pytest.mark.parametrize("status, expected", [(401, 401), (403, 401), (429, 500), (503, 500)])
def test_auth_errors_do_not_leak_upstream_body(status, expected):
    with make_client(lambda request: httpx.Response(status, text="private upstream content")) as client:
        response = client.get("/protected", headers={"Authorization": "Bearer invalid"})
        assert response.status_code == expected
        assert "private" not in response.text


def test_network_failure():
    def handler(request):
        raise httpx.ConnectError("private details", request=request)
    with make_client(handler) as client:
        response = client.get("/protected", headers={"Authorization": "Bearer test"})
        assert response.status_code == 500
        assert response.json()["error"]["code"] == "AUTH_SERVICE_UNAVAILABLE"


@pytest.mark.parametrize("body", [{}, {"id": "invalid"}, []])
def test_malformed_user_response(body):
    with make_client(lambda request: httpx.Response(200, json=body)) as client:
        response = client.get("/protected", headers={"Authorization": "Bearer test"})
        assert response.status_code == 500


def test_health_docs_and_not_found():
    with make_client(lambda request: httpx.Response(500)) as client:
        assert client.get("/health").json() == {"status": "ok"}
        assert client.get("/docs").status_code == 200
        assert client.get("/missing").json()["error"]["code"] == "NOT_FOUND"
