"""고객센터: 학생은 자기 문의만, 관리자 답변은 학생을 숨기고 알림 한 번."""
import json
from uuid import UUID, uuid4

import httpx
from fastapi.testclient import TestClient

from server.config import Settings
from server.main import create_app
from server.routes import admin

USER_ID = str(uuid4())
HEADERS = {"Authorization": "Bearer t"}
ADMIN = "boss@skuniv.ac.kr"
BODY = {"category": "앱 오류", "title": "알림이 안 와요", "body": "어제부터 안 와요"}
ROW = {"id": 1, "created_at": "2026-10-31T09:00:00+09:00", **BODY, "answer": None, "answered_at": None}


def client_for(db, email="student@skuniv.ac.kr"):
    def handler(request):
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": USER_ID, "email": email, "email_confirmed_at": "2026-10-27T00:00:00Z"})
        return db(request)
    return TestClient(create_app(Settings("https://example.supabase.co", "pk", "sk", frozenset({ADMIN})), httpx.MockTransport(handler)))


def test_list_only_asks_for_own_tickets():
    def db(request):
        assert request.url.params["user_id"] == f"eq.{USER_ID}" and request.headers["authorization"] == "Bearer t"
        return httpx.Response(200, json=[ROW])
    with client_for(db) as client:
        assert client.get("/support", headers=HEADERS).json() == [ROW]
        assert client.get("/support").status_code == 401


def test_create_sends_only_student_fields():
    def db(request):
        assert json.loads(request.content) == BODY
        return httpx.Response(201, json=[ROW])
    with client_for(db) as client:
        assert client.post("/support", headers=HEADERS, json={**BODY, "title": f"  {BODY['title']}  "}).status_code == 201


def test_create_rejects_blank_unknown_category_and_answer_field():
    def db(request):
        raise AssertionError("호출되면 안 됨")
    with client_for(db) as client:
        for bad in ({**BODY, "body": "   "}, {**BODY, "category": "장학"}, {**BODY, "answer": "셀프 답변"}):
            assert client.post("/support", headers=HEADERS, json=bad).status_code == 400


def test_student_cannot_use_admin_routes():
    def db(request):
        raise AssertionError("호출되면 안 됨")
    with client_for(db) as client:
        assert client.get("/admin/support", headers=HEADERS).status_code == 403
        assert client.put("/admin/support/1", headers=HEADERS, json={"answer": "x"}).status_code == 403


def test_admin_list_hides_who_asked():
    def db(request):
        assert "user_id" not in request.url.params["select"] and request.headers["authorization"] == "Bearer sk"
        assert request.url.params["answer"] == "is.null"
        return httpx.Response(200, json=[ROW])
    with client_for(db, ADMIN) as client:
        assert client.get("/admin/support?status=open", headers=HEADERS).json() == [ROW]


def test_admin_answer_saves_and_notifies_without_returning_student(monkeypatch):
    sent = []
    async def send(*args):
        sent.append(args)
    monkeypatch.setattr(admin, "send_notification", send)
    def db(request):
        body = json.loads(request.content)
        assert body["answer"] == "설정에서 켜 주세요" and body["answered_at"] and request.url.params["id"] == "eq.1"
        return httpx.Response(200, json=[{"id": 1, "user_id": USER_ID}])
    with client_for(db, ADMIN) as client:
        res = client.put("/admin/support/1", headers=HEADERS, json={"answer": " 설정에서 켜 주세요 "})
    assert res.status_code == 200 and res.json() == {"id": 1}
    assert sent == [(UUID(USER_ID), "support", "문의하신 내용에 답변이 도착했어요", 1)]


def test_answer_survives_notification_failure_and_missing_ticket_is_404(monkeypatch):
    async def fail(*args):
        raise RuntimeError("push down")
    monkeypatch.setattr(admin, "send_notification", fail)
    rows = [[{"id": 1, "user_id": USER_ID}], []]
    def db(request):
        return httpx.Response(200, json=rows.pop(0))
    with client_for(db, ADMIN) as client:
        assert client.put("/admin/support/1", headers=HEADERS, json={"answer": "답"}).status_code == 200
        assert client.put("/admin/support/9", headers=HEADERS, json={"answer": "답"}).status_code == 404
