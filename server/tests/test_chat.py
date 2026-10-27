"""POST /chat: 가짜 AI + 가짜 Supabase로 흐름 확인 (문서 근거 답 / 근거 없으면 '모른다' + 기록)."""
import json
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from server.ai import client as ai_client
from server.config import Settings
from server.main import create_app

USER_ID = str(uuid4())
HEADERS = {"Authorization": "Bearer user-token"}
CHUNK = {"content": "[학칙] 제 30 조(휴학) 휴학 기간은 통산 6학기를 넘을 수 없다.",
         "document": {"title": "2026 서경대학교 대학요람 · 학칙", "url": None}}


def run_chat(monkeypatch, text, chunks):
    monkeypatch.setattr(ai_client, "AI_FAKE", True)
    saved = []

    def handler(request):
        path = request.url.path
        if path == "/auth/v1/user":
            return httpx.Response(200, json={"id": USER_ID, "email": "s@skuniv.ac.kr", "email_confirmed_at": "2026-10-27T00:00:00Z"})
        table = path.removeprefix("/rest/v1/")
        if request.method == "GET":
            return httpx.Response(200, json={"profiles": [{"nickname": "홍길동", "grade": 4}], "doc_chunks": chunks,
                                             "academic_calendar": []}.get(table, []))
        body = json.loads(request.content or b"null")
        saved.append((request.method, table, body))
        if table == "messages" and body["role"] == "assistant":
            return httpx.Response(201, json=[{"id": 9, **body, "created_at": "2026-10-27T12:00:00+09:00"}])
        return httpx.Response(201, json=[{"id": 1}])

    app = create_app(Settings("https://example.supabase.co", "test-key"), httpx.MockTransport(handler))
    with TestClient(app) as client:
        res = client.post("/chat", headers=HEADERS, json={"text": text})
    return res, saved


def test_answer_from_documents(monkeypatch):
    res, saved = run_chat(monkeypatch, "휴학 기간은 최대 몇 학기야?", [CHUNK])
    assert res.status_code == 200
    msg = res.json()["message"]
    assert msg["sources"] == [{"title": "2026 서경대학교 대학요람 · 학칙", "url": None}]
    assert not any(t == "unanswered_questions" for _, t, _ in saved)


def test_unknown_is_recorded(monkeypatch):
    res, saved = run_chat(monkeypatch, "오늘 학식 메뉴 뭐야?", [])
    assert res.status_code == 200
    assert res.json()["message"]["sources"] == []
    assert ("POST", "unanswered_questions", {"user_id": USER_ID, "message_id": 9, "question": "오늘 학식 메뉴 뭐야?"}) in saved
