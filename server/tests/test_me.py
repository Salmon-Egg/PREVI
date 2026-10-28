from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from server.config import Settings
from server.main import create_app

USER_ID = str(uuid4())
HEADERS = {"Authorization": "Bearer user-token"}
ROW = dict(nickname="홍길동", department="소프트웨어학과", minor=None, grade=4,
           semester=1, status="enrolled", admission_year=2021, interests=[],
           consent_agreed_at=None, notify_notice=False, notify_deadline=False,
           notify_calendar=False, notify_chat=False, notify_time="09:00:00", push_token="secret-device")


def client_for(database_handler):
    def handler(request):
        assert request.headers["authorization"] == "Bearer user-token"
        assert request.headers["apikey"] == "test-key"
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": USER_ID, "email": "student@skuniv.ac.kr", "email_confirmed_at": "2026-10-27T00:00:00Z"})
        assert request.url.path == "/rest/v1/profiles"
        return database_handler(request)
    return TestClient(create_app(Settings("https://example.supabase.co", "test-key"), httpx.MockTransport(handler)))


def test_get_only_current_user_and_hide_internal_fields():
    def handler(request):
        assert request.url.params["user_id"] == f"eq.{USER_ID}"
        return httpx.Response(200, json=[ROW])
    with client_for(handler) as client:
        response = client.get("/me", headers=HEADERS)
        assert response.status_code == 200
        body = response.json()
        assert body["notify"]["time"] == "09:00"
        assert body["consent"] == {"agreed": False, "agreed_at": None}
        assert "push_token" not in body
        assert "user_id" not in body


def test_profile_not_created_yet():
    with client_for(lambda request: httpx.Response(200, json=[])) as client:
        assert client.get("/me", headers=HEADERS).status_code == 404


def test_quiet_time_roundtrip_and_profile_refresh_finishes_before_response(monkeypatch):
    import json
    state = {**ROW,'notify_quiet':''}
    refreshed = []
    async def refresh(uid):
        refreshed.append(uid)
    monkeypatch.setattr('server.jobs.pipeline.refresh_student',refresh)
    def handler(request):
        if request.method == 'POST':
            return httpx.Response(201)
        if request.method == 'PATCH':
            state.update(json.loads(request.content))
        return httpx.Response(200,json=[state])
    with client_for(handler) as client:
        response = client.put('/me',headers=HEADERS,json={'status':'leave','notify':{'quiet':'22:00-07:00'}})
        assert response.status_code == 200
        assert refreshed == [USER_ID]
        assert response.json()['notify']['quiet'] == '22:00-07:00'
        assert client.get('/me',headers=HEADERS).json()['status'] == 'leave'
        response = client.put('/me',headers=HEADERS,json={'notify':{'quiet':''}})
        assert response.json()['notify']['quiet'] == ''


def test_partial_update_and_server_consent_timestamp():
    import json
    calls = []
    def handler(request):
        calls.append(request.method)
        payload = json.loads(request.content)
        if request.method == "POST":
            assert payload == {"user_id": USER_ID}
            assert "ignore-duplicates" in request.headers["prefer"]
            return httpx.Response(201)
        assert request.url.params["user_id"] == f"eq.{USER_ID}"
        assert payload["nickname"] == "새 이름"
        assert payload["notify_notice"] is True
        assert "notify_deadline" not in payload
        assert payload["consent_agreed_at"].endswith("+00:00")
        return httpx.Response(200, json=[{**ROW, **payload}])
    with client_for(handler) as client:
        response = client.put("/me", headers=HEADERS, json={"nickname": "새 이름", "notify": {"notice": True}, "consent": {"agreed": True}})
        assert response.status_code == 200
        assert response.json()["consent"]["agreed"] is True
        assert calls == ["POST", "PATCH"]


def test_quiet_time_and_assistant_scope():
    import json
    def handler(request):
        if request.method == "POST":
            return httpx.Response(201)
        if request.method == "GET":  # 지금 scope와 합치기
            return httpx.Response(200, json=[{"assistant_scope": {"grades": True, "timetable": True}}])
        payload = json.loads(request.content)
        assert payload == {"notify_quiet": "22:00-07:00", "assistant_scope": {"grades": False, "timetable": True}}
        return httpx.Response(200, json=[{**ROW, **payload}])
    with client_for(handler) as client:
        body = client.put("/me", headers=HEADERS, json={"notify": {"quiet": "22:00-07:00"}, "assistant_scope": {"grades": False}}).json()
        assert body["notify"]["quiet"] == "22:00-07:00"
        assert body["assistant_scope"] == {"grades": False, "timetable": True}


@pytest.mark.parametrize("payload", [{"user_id": USER_ID}, {"grade": 0}, {"status": None}, {"notify": {"time": "25:00"}}, {"notify": {"notice": None}}, {"consent": {"agreed": True, "agreed_at": "fake"}},
                                     {"notify": {"quiet": "22-07"}}, {"assistant_scope": {"photos": True}}])
def test_invalid_updates_never_touch_database(payload):
    def handler(request):
        pytest.fail("잘못된 입력은 DB에 전달되면 안 됨")
    with client_for(handler) as client:
        assert client.put("/me", headers=HEADERS, json=payload).status_code == 400


def test_database_error_does_not_expose_details():
    with client_for(lambda request: httpx.Response(500, text="private DB details")) as client:
        response = client.get("/me", headers=HEADERS)
        assert response.status_code == 500
        assert "private" not in response.text
