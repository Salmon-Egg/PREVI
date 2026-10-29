"""POST /chat: 가짜 AI + 가짜 Supabase로 흐름 확인 (문서 근거 답 / 근거 없으면 '모른다' + 기록)."""
import json
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from server.ai import client as ai_client
from server.ai import tasks
from server.config import Settings
from server.main import create_app

USER_ID = str(uuid4())
HEADERS = {"Authorization": "Bearer user-token"}
CHUNK = {"content": "[학칙] 제 30 조(휴학) 휴학 기간은 통산 6학기를 넘을 수 없다.",
         "document": {"title": "2026 서경대학교 대학요람 · 학칙", "url": None}}


def run_chat(monkeypatch, text, chunks, context=None, notices=(), calendar=(), history=None):
    monkeypatch.setattr(ai_client, "AI_FAKE", True)
    saved = []

    def handler(request):
        path = request.url.path
        if path == "/auth/v1/user":
            return httpx.Response(200, json={"id": USER_ID, "email": "s@skuniv.ac.kr", "email_confirmed_at": "2026-10-27T00:00:00Z"})
        table = path.removeprefix("/rest/v1/")
        if request.method == "GET":
            return httpx.Response(200, json={"profiles": [{"nickname": "홍길동", "grade": 4, "semester": 1, "status": "leave",
                                                           "department": "소프트웨어학과", "admission_year": 2023}],
                                             "doc_chunks": chunks, "notices": list(notices), "academic_calendar": list(calendar),
                                             "conversations": [{"id": 5}], "messages": history or []}.get(table, []))
        body = json.loads(request.content or b"null")
        saved.append((request.method, table, body))
        if table == "messages" and body["role"] == "assistant":
            return httpx.Response(201, json=[{"id": 9, **body, "created_at": "2026-10-27T12:00:00+09:00"}])
        return httpx.Response(201, json=[{"id": 1}])

    app = create_app(Settings("https://example.supabase.co", "test-key"), httpx.MockTransport(handler))
    with TestClient(app) as client:
        res = client.post("/chat", headers=HEADERS, json={"text": text, "context": context,
                                                          "conversation_id": 5 if history is not None else None})
    return res, saved


def test_status_context_from_leave_screen(monkeypatch):
    res, _ = run_chat(monkeypatch, "복학 신청은 언제 해?", [CHUNK], {"kind": "status", "id": 0})
    assert res.status_code == 200


def test_answer_from_documents(monkeypatch):
    res, saved = run_chat(monkeypatch, "휴학 기간은 최대 몇 학기야?", [CHUNK])
    assert res.status_code == 200
    msg = res.json()["message"]
    assert msg["sources"] == [{"title": "2026 서경대학교 대학요람 · 학칙", "url": None}]
    assert not any(t == "unanswered_questions" for _, t, _ in saved)


def test_notice_context_answers_from_notice(monkeypatch):
    notice = {"title": "2학기 성적우수장학금 신청", "summary": ["마감: 11/5"], "body": "신청 마감: 2026-11-05 18:00",
              "url": "https://example.com/n/1", "deadline": "2026-11-05T18:00:00+09:00"}
    res, saved = run_chat(monkeypatch, "이거 마감 언제야?", [], {"kind": "notice", "id": 1}, notices=[notice])
    msg = res.json()["message"]
    assert "2026-11-05" in msg["text"]
    assert msg["sources"] == [{"title": "2학기 성적우수장학금 신청", "url": "https://example.com/n/1"}]
    assert not any(t == "unanswered_questions" for _, t, _ in saved)


def test_calendar_button_ignores_common_words(monkeypatch):
    calendar = [{"title": "2027-1학기 복학 신청 기간", "end_date": "2099-01-01"}]
    res, _ = run_chat(monkeypatch, "휴학 신청 기간은 최대 몇 학기야?", [CHUNK], calendar=calendar)
    assert res.json()["message"]["actions"] == []  # '신청'·'기간'만 겹침
    calendar = [{"title": "2학기 수강신청 정정 기간", "end_date": "2099-01-01"}]
    res, _ = run_chat(monkeypatch, "수강 정정 휴학 기간 언제야?", [CHUNK], calendar=calendar)
    msg = res.json()["message"]
    assert msg["actions"][0]["payload"]["title"] == "2학기 수강신청 정정 기간"
    assert msg["text"].endswith("아래 버튼으로 마감 알림을 받아 둘 수 있어요.")


def test_when_question_answers_from_calendar(monkeypatch):
    calendar = [{"title": "1학기 수강신청", "start_date": "2099-02-15", "end_date": "2099-02-17"}]
    res, saved = run_chat(monkeypatch, "수강신청 언제야?", [], calendar=calendar)  # 요람엔 날짜가 없음
    msg = res.json()["message"]
    assert "2099년 2월 15일 ~ 2099년 2월 17일" in msg["text"]
    assert msg["actions"][0]["payload"] == {"title": "1학기 수강신청", "due_date": "2099-02-17"}
    assert not any(t == "unanswered_questions" for _, t, _ in saved)


@pytest.mark.parametrize("q", ["휴학 알려줘", "장학금?", "졸업 관련해서 좀 알려줘"])
def test_vague_question_asks_back_without_ai(monkeypatch, q):
    monkeypatch.setattr(tasks, "_ask", lambda *a, **k: pytest.fail("AI를 부르면 안 됨"))
    res, saved = run_chat(monkeypatch, q, [])
    msg = res.json()["message"]
    assert "어떤 게 궁금하세요?" in msg["text"]
    assert msg["actions"] and all(a["type"] == "ask" and a["payload"]["text"] for a in msg["actions"])
    assert not any(t == "unanswered_questions" for _, t, _ in saved)


def test_specific_question_is_not_asked_back(monkeypatch):
    res, _ = run_chat(monkeypatch, "휴학 기간은 최대 몇 학기야?", [CHUNK])
    assert "궁금하세요" not in res.json()["message"]["text"]


def test_previous_turn_goes_to_ai(monkeypatch):
    seen = []
    real = tasks.route_question
    monkeypatch.setattr(tasks, "route_question", lambda q: seen.append(q) or real(q))
    res, _ = run_chat(monkeypatch, "그럼 복학은?", [CHUNK], history=[{"text": "휴학 최대 몇 학기야?"}])
    assert res.status_code == 200
    assert seen == ["[이전 질문] 휴학 최대 몇 학기야?\n질문: 그럼 복학은?"]
    run_chat(monkeypatch, "오늘 학식 메뉴 뭐야?", [], history=[{"text": "휴학 최대 몇 학기야?"}])
    assert seen[-1] == "오늘 학식 메뉴 뭐야?"  # 주제가 바뀐 질문엔 앞 질문을 안 붙임


def test_my_info_failure_is_recorded(monkeypatch):
    res, saved = run_chat(monkeypatch, "나 졸업할 수 있어?", [])  # 졸업 기준 표가 비어 있음
    assert "졸업 기준" in res.json()["message"]["text"]
    assert any(t == "unanswered_questions" for _, t, _ in saved)


def test_crisis_gets_hotlines_without_ai(monkeypatch):
    monkeypatch.setattr(tasks, "_ask", lambda *a, **k: pytest.fail("AI를 부르면 안 됨"))
    res, saved = run_chat(monkeypatch, "요즘 너무 힘들어서 죽고 싶어", [])
    text = res.json()["message"]["text"]
    assert "02-940-7607" in text and "109" in text
    assert not any(t == "unanswered_questions" for _, t, _ in saved)


@pytest.mark.parametrize("q, want", [("안녕!", "안녕하세요, 홍길동님!"), ("넌 누구야?", "저는 PREVI예요"), ("고마워", "다행이에요")])
def test_smalltalk_without_ai(monkeypatch, q, want):
    monkeypatch.setattr(tasks, "_ask", lambda *a, **k: pytest.fail("AI를 부르면 안 됨"))
    res, saved = run_chat(monkeypatch, q, [])
    assert want in res.json()["message"]["text"]
    assert not any(t == "unanswered_questions" for _, t, _ in saved)


def test_off_topic_is_not_recorded(monkeypatch):
    res, saved = run_chat(monkeypatch, "근처 맛집 추천해줘", [])
    assert "도와드리기 어려운" in res.json()["message"]["text"]
    assert not any(t == "unanswered_questions" for _, t, _ in saved)


def test_unknown_is_recorded(monkeypatch):
    res, saved = run_chat(monkeypatch, "오늘 학식 메뉴 뭐야?", [])
    assert res.status_code == 200
    assert res.json()["message"]["sources"] == []
    assert ("POST", "unanswered_questions", {"user_id": USER_ID, "message_id": 9, "question": "오늘 학식 메뉴 뭐야?"}) in saved


def test_split_questions_single_and_fallback(monkeypatch):
    monkeypatch.setattr(ai_client, "AI_FAKE", True)  # 가짜 AI는 나누기를 못 함 → 기호로 나눔
    assert tasks.split_questions("휴학 기간은 최대 몇 학기야?") == ["휴학 기간은 최대 몇 학기야?"]
    assert tasks.split_questions("휴학, 복학, 장학금 조건 알려줘") == ["휴학", "복학", "장학금 조건 알려줘"]
    assert tasks.split_questions("휴학은 언제 해? 그리고 복학은?") == ["휴학은 언제 해", "복학은"]


def test_many_questions_answered_one_by_one(monkeypatch):
    res, _ = run_chat(monkeypatch, "휴학 기간은 최대 몇 학기야? 복학 신청은 언제 해? 학식 메뉴는? 졸업 학점은?", [CHUNK])
    text = res.json()["message"]["text"]
    assert text.startswith("① 휴학 기간은 최대 몇 학기야") and "② 복학 신청은 언제 해" in text and "③ 학식 메뉴는" in text
    assert "나머지 1개 질문" in text
