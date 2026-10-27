from datetime import date
import json
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from server.config import Settings
from server.main import create_app
from server.routes.todos import todo_output

USER_ID = str(uuid4())
HEADERS = {"Authorization": "Bearer student-token"}
TODO = {"id": 1, "type": "deadline", "title": "서류 준비", "due_date": "2026-10-30", "done": False,
        "reason": "직접 등록", "link": None, "source_kind": None, "source_id": None, "done_at": None}
NOTICE = {"id": 2, "title": "장학 신청", "category": "장학", "summary": ["대상", "마감", "서류"], "deadline": None,
          "documents": [], "url": "https://www.skuniv.ac.kr/notice/2", "posted_at": "2026-10-27T09:00:00+09:00"}


def client_for(db):
    def handler(request):
        assert request.headers["authorization"] == "Bearer student-token"
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": USER_ID, "email": "student@skuniv.ac.kr", "email_confirmed_at": "2026-10-27T00:00:00Z"})
        return db(request)
    return TestClient(create_app(Settings("https://example.supabase.co", "test-key"), httpx.MockTransport(handler)))


def test_dday_today_past_future_and_no_deadline():
    assert todo_output(TODO, today=date(2026, 10, 27))["d_day"] == 3
    assert todo_output(TODO, today=date(2026, 10, 30))["d_day"] == 0
    assert todo_output(TODO, today=date(2026, 10, 31))["d_day"] == -1
    assert todo_output({**TODO, "due_date": None})["d_day"] is None


def test_todo_filters_and_order():
    def db(request):
        assert request.url.params["user_id"] == "eq." + USER_ID
        assert request.url.params["done"] == "eq.false"
        assert request.url.params["type"] == "eq.deadline"
        assert request.url.params["order"] == "due_date.asc.nullslast,id.asc"
        return httpx.Response(200, json=[TODO])
    with client_for(db) as client:
        response = client.get("/todos?type=deadline&done=false", headers=HEADERS)
        assert response.status_code == 200
        assert "reason" not in response.json()[0]


def test_todo_creation_cannot_set_owner_or_completion():
    with client_for(lambda request: pytest.fail("잘못된 입력을 저장하면 안 됨")) as client:
        assert client.post("/todos", headers=HEADERS, json={"title": "할 일", "user_id": USER_ID}).status_code == 400
        assert client.post("/todos", headers=HEADERS, json={"title": "할 일", "done": True}).status_code == 400


def test_manual_todo_has_server_assigned_owner():
    def db(request):
        assert json.loads(request.content) == {"user_id": USER_ID, "title": "서류 준비", "type": "deadline", "due_date": "2026-10-30"}
        return httpx.Response(201, json=[TODO])
    with client_for(db) as client:
        assert client.post("/todos", headers=HEADERS, json={"title": "서류 준비", "due_date": "2026-10-30"}).status_code == 200


def test_notice_todo_copies_link_from_server():
    def db(request):
        if request.url.path == "/rest/v1/notices":
            return httpx.Response(200, json=[NOTICE])
        payload = json.loads(request.content)
        assert payload["link"] == NOTICE["url"]
        assert payload["source_id"] == 2
        return httpx.Response(201, json=[{**TODO, "type": "scholarship", "source_kind": "notice", "source_id": 2, "link": NOTICE["url"]}])
    with client_for(db) as client:
        result = client.post("/todos", headers=HEADERS, json={"title": "장학 신청", "type": "scholarship", "source": {"kind": "notice", "id": 2}})
        assert result.status_code == 200
        assert result.json()["source"] == {"kind": "notice", "id": 2}


def test_scholarship_source_required():
    with client_for(lambda request: httpx.Response(200, json=[{**NOTICE, "category": "학사"}])) as client:
        assert client.post("/todos", headers=HEADERS, json={"title": "장학", "type": "scholarship"}).status_code == 400
        assert client.post("/todos", headers=HEADERS, json={"title": "장학", "type": "scholarship", "source": {"kind": "notice", "id": 2}}).status_code == 400


def test_done_patch_filters_owner_and_only_sends_done():
    def db(request):
        assert request.url.params["id"] == "eq.1"
        assert request.url.params["user_id"] == "eq." + USER_ID
        assert json.loads(request.content) == {"done": True}
        return httpx.Response(200, json=[{**TODO, "done": True, "done_at": "2026-10-27T00:00:00Z"}])
    with client_for(db) as client:
        assert client.patch("/todos/1", headers=HEADERS, json={"done": True}).json()["done"] is True


@pytest.mark.parametrize("payload", [{"done": "false"}, {"done": 1}, {"done": True, "user_id": USER_ID}])
def test_patch_rejects_ambiguous_or_extra_input(payload):
    with client_for(lambda request: pytest.fail("잘못된 완료 값")) as client:
        assert client.patch("/todos/1", headers=HEADERS, json=payload).status_code == 400


def test_missing_todo_and_duplicate():
    with client_for(lambda request: httpx.Response(200, json=[])) as client:
        assert client.get("/todos/999", headers=HEADERS).status_code == 404
        assert client.patch("/todos/999", headers=HEADERS, json={"done": True}).status_code == 404
    with client_for(lambda request: httpx.Response(409, json={"detail": "private"})) as client:
        response = client.post("/todos", headers=HEADERS, json={"title": "할 일"})
        assert response.json()["error"]["code"] == "TODO_ALREADY_EXISTS"


def test_notice_list_uses_only_current_user_matches():
    def db(request):
        assert request.url.path == "/rest/v1/eligibility"
        assert request.url.params["user_id"] == "eq." + USER_ID
        assert request.url.params["verdict"] == "in.(eligible,check)"
        return httpx.Response(200, json=[{"notice": NOTICE}])
    with client_for(db) as client:
        assert client.get("/notices", headers=HEADERS).json()[0]["summary"] == ["대상"]


def test_notice_detail_and_application_history():
    def db(request):
        if request.url.path == "/rest/v1/notices":
            return httpx.Response(200, json=[NOTICE])
        assert request.url.params["user_id"] == "eq." + USER_ID
        return httpx.Response(200, json=[])
    with client_for(db) as client:
        assert client.get("/notices/2", headers=HEADERS).json()["documents"] == []
        assert client.get("/scholarship-applications", headers=HEADERS).json() == []
