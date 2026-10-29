"""관리자 API: 가짜 Supabase로 권한·묶기·업로드·발송 대상 확인."""
import base64
import json

import httpx
from fastapi.testclient import TestClient

from server.config import Settings
from server.main import create_app
from server.routes import admin

HEADERS = {"Authorization": "Bearer t"}
ADMIN = "boss@skuniv.ac.kr"


def make(email=ADMIN, rows=None, counts=None):
    saved = []

    def handler(request):
        path = request.url.path
        if path == "/auth/v1/user":
            return httpx.Response(200, json={"id": "00000000-0000-0000-0000-000000000009", "email": email,
                                             "email_confirmed_at": "2026-10-29T00:00:00Z"})
        if path.startswith("/auth/v1/admin/users"):
            uid = path.removeprefix("/auth/v1/admin/users").strip("/")
            accounts = (rows or {}).get("users", [])
            if request.method == "DELETE":
                saved.append(("DELETE", "users", uid, None))
                return httpx.Response(200, json={})
            if uid:
                found = [a for a in accounts if a["id"] == uid]
                return httpx.Response(200, json=found[0]) if found else httpx.Response(404, json={})
            return httpx.Response(200, json={"users": accounts})
        table = path.removeprefix("/rest/v1/")
        if request.headers.get("prefer") == "count=exact":
            return httpx.Response(206, json=[], headers={"content-range": f"0-0/{(counts or {}).get(table, 0)}"})
        if request.method == "GET":
            return httpx.Response(200, json=(rows or {}).get(table, []))
        body = json.loads(request.content or b"null")
        saved.append((request.method, table, dict(request.url.params), body))
        return httpx.Response(201, json=[{"id": 7, **(body or {})}])

    app = create_app(Settings("https://example.supabase.co", "pk", "sk", frozenset({ADMIN})), httpx.MockTransport(handler))
    return TestClient(app), saved


def test_only_admin_emails():
    client, _ = make(email="student@skuniv.ac.kr")
    with client:
        assert client.get("/admin/summary", headers=HEADERS).status_code == 403


def test_summary_answer_rate():
    client, _ = make(counts={"messages": 50, "unanswered_questions": 5})
    with client:
        body = client.get("/admin/summary", headers=HEADERS).json()
    assert body["questions_week"] == 50 and body["answer_rate"] == 90


def test_unanswered_grouped_by_same_sentence():
    rows = {"unanswered_questions": [
        {"id": 3, "question": "학식 메뉴 뭐야?", "cause": None, "created_at": "2026-10-29"},
        {"id": 2, "question": "셔틀 시간", "cause": None, "created_at": "2026-10-28"},
        {"id": 1, "question": "학식메뉴 뭐야", "cause": None, "created_at": "2026-10-27"}]}
    client, _ = make(rows=rows)
    with client:
        groups = client.get("/admin/unanswered", headers=HEADERS).json()
    assert groups[0] == {"question": "학식 메뉴 뭐야?", "ids": [3, 1], "count": 2, "cause": None, "last_at": "2026-10-29"}


def test_answer_saves_document_and_closes_questions(monkeypatch):
    docs = []
    monkeypatch.setattr(admin, "_save_document", lambda *a: docs.append(a))
    client, saved = make()
    with client:
        res = client.post("/admin/answers", headers=HEADERS, json={"question": "학식?", "answer": "생활관 1층", "ids": [3, 1]})
    assert res.status_code == 201
    assert docs[0][2] == "관리자 답변" and "답: 생활관 1층" in docs[0][3][0]
    method, table, params, body = saved[0]
    assert (method, table, params["id"], body["status"]) == ("PATCH", "unanswered_questions", "in.(3,1)", "done")


def test_upload_text_document(monkeypatch):
    docs = []
    monkeypatch.setattr(admin, "_save_document", lambda *a: docs.append(a))
    text = "제 1 조(목적) 이 규정은 학생 상담 운영에 필요한 사항을 정한다. 상담은 학생상담센터에서 한다.\n"
    client, _ = make()
    with client:
        res = client.post("/admin/documents", headers=HEADERS, json={
            "title": "상담 규정", "kind": "규정", "filename": "a.txt", "content_base64": base64.b64encode(text.encode()).decode()})
        bad = client.post("/admin/documents", headers=HEADERS, json={
            "title": "x", "kind": "규정", "filename": "a.hwp", "content_base64": "AAAA"})
    assert res.json() == {"chunks": 1} and docs[0][3][0].startswith("[상담 규정] 제 1 조")
    assert bad.status_code == 400


def test_broadcast_preview_counts_target():
    rows = {"profiles": [{"grade": 4, "department": "소프트웨어학과", "status": "enrolled"},
                         {"grade": 4, "department": "소프트웨어학과", "status": "returned"},
                         {"grade": 2, "department": "소프트웨어학과", "status": "enrolled"}]}
    client, _ = make(rows=rows)
    with client:
        res = client.post("/admin/broadcast/preview", headers=HEADERS, json={"grades": [4], "statuses": ["enrolled"]})
    assert res.json() == {"count": 2}  # 복학생은 재학생 공지도 받음


STUDENT_ID = "00000000-0000-0000-0000-000000000001"
BOSS_ID = "00000000-0000-0000-0000-000000000002"
ACCOUNTS = {"users": [
    {"id": STUDENT_ID, "email": "kim@skuniv.ac.kr", "created_at": "2026-10-01T00:00:00Z", "last_sign_in_at": None},
    {"id": BOSS_ID, "email": ADMIN, "created_at": "2026-09-01T00:00:00Z", "last_sign_in_at": "2026-10-29T00:00:00Z"}],
    "profiles": [{"user_id": STUDENT_ID, "department": "소프트웨어학과", "grade": 3, "status": "enrolled"}]}


def test_users_joins_profile_and_marks_admin():
    client, _ = make(rows=ACCOUNTS)
    with client:
        body = client.get("/admin/users", headers=HEADERS).json()
    assert [u["email"] for u in body] == ["kim@skuniv.ac.kr", ADMIN]  # 최근 가입 먼저
    assert body[0]["department"] == "소프트웨어학과" and not body[0]["admin"]
    assert body[1]["admin"] and body[1]["grade"] is None  # 처음 설정 안 한 계정


def test_delete_user_but_not_admin():
    client, saved = make(rows=ACCOUNTS)
    with client:
        assert client.delete(f"/admin/users/{BOSS_ID}", headers=HEADERS).status_code == 400
        assert client.delete("/admin/users/00000000-0000-0000-0000-00000000000f", headers=HEADERS).status_code == 404
        assert client.delete(f"/admin/users/{STUDENT_ID}", headers=HEADERS).status_code == 204
    assert saved == [("DELETE", "users", STUDENT_ID, None)]


def test_calendar_rejects_bad_input():
    client, saved = make()
    with client:
        res = client.post("/admin/data/calendar", headers=HEADERS, json={"title": "", "start_date": "x"})
    assert res.status_code == 400 and not saved


def test_student_feedback_on_answer():
    client, saved = make(email="student@skuniv.ac.kr")
    with client:
        res = client.patch("/messages/9/feedback", headers=HEADERS, json={"feedback": "down"})
    assert res.status_code == 200
    assert saved[0][:3] == ("PATCH", "messages", {"id": "eq.9", "role": "eq.assistant", "select": "id,feedback"})
