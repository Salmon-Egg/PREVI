"""POST /chat: 가짜 AI + 가짜 Supabase로 흐름 확인 (문서 근거 답 / 근거 없으면 '모른다' + 기록)."""
import asyncio
import json
from datetime import date
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from server.ai import client as ai_client
from server.ai import tasks
from server.config import Settings
from server.main import create_app
from server.routes import chat as chat_route

USER_ID = str(uuid4())
HEADERS = {"Authorization": "Bearer user-token"}
CHUNK = {"content": "[학칙] 제 30 조(휴학) 휴학 기간은 통산 6학기를 넘을 수 없다.",
         "document": {"title": "2026 서경대학교 대학요람 · 학칙", "url": None}}


def run_chat(monkeypatch, text, chunks, context=None, notices=(), calendar=(), history=None, status="leave"):
    monkeypatch.setattr(ai_client, "AI_FAKE", True)
    saved = []

    def handler(request):
        path = request.url.path
        if path == "/auth/v1/user":
            return httpx.Response(200, json={"id": USER_ID, "email": "s@skuniv.ac.kr", "email_confirmed_at": "2026-10-27T00:00:00Z"})
        table = path.removeprefix("/rest/v1/")
        if request.method == "GET":
            return httpx.Response(200, json={"profiles": [{"nickname": "홍길동", "grade": 4, "semester": 1, "status": status,
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


@pytest.mark.parametrize("status, question, student", [
    ("enrolled", "복학 신청은 언제 해?", {}),
    ("returned", "복학 신청은 언제 해?", {}),
    ("leave", "복학 신청은 언제 해?", {"학적": "휴학"}),
    ("enrolled", "휴학 신청은 언제 해?", {"학적": "재학"}),
])
def test_return_advice_only_for_students_on_leave(monkeypatch, status, question, student):
    seen = []
    monkeypatch.setattr(tasks, "answer_from_docs", lambda q, chunks, s: seen.append(s) or "답")
    assert run_chat(monkeypatch, question, [CHUNK], status=status)[0].status_code == 200
    assert seen == [student]


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


def test_vague_question_asks_back_mid_conversation(monkeypatch):
    res, _ = run_chat(monkeypatch, "휴학 알려줘", [], history=[{"text": "주차 등록은 어디서 해?"}])
    assert res.json()["message"]["actions"][0]["type"] == "ask"


def test_named_notice_without_answer_points_to_original(monkeypatch):
    monkeypatch.setattr(tasks, "answer_from_docs", lambda *a: None)
    notice = {"id": 64, "title": "고졸 후학습자 장학사업(희망사다리II유형) 연장 안내", "summary": [], "body": "첨부파일", "url": "https://example.com/64", "deadline": None}
    res, saved = run_chat(monkeypatch, "희망사다리 장학사업 마감 언제야?", [], notices=[notice])
    msg = res.json()["message"]
    assert "마감일 확인 필요" in msg["text"] and "원문" in msg["text"]
    assert msg["sources"] == [{"title": notice["title"], "url": notice["url"]}]
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


@pytest.mark.parametrize("subject, ok", [("휴학", True), ("휴학의", True), ("휴학 제도", True), (None, True), ("미래인재 마일리지", False)])
def test_subject_must_be_in_documents(subject, ok):
    assert tasks._subject_in_docs(subject, ["[학칙] 휴학 기간은 통산 6학기"]) is ok


def test_answer_on_unknown_subject_is_recorded(monkeypatch):
    monkeypatch.setattr(ai_client, "AI_FAKE", True)
    monkeypatch.setattr(tasks, "_ask", lambda name, _: {"subject": "미래인재 마일리지", "answer": "수강신청서를 내면 돼요."}
                        if name == "chat_answer" else {"intent": "document"})
    q = "미래인재 마일리지 제도 신청 절차 알려줘"
    monkeypatch.setattr(ai_client, "embed", lambda _: None)
    chunk = {"content": "[학칙] 수강 신청 절차 제도 안내", "document": CHUNK["document"]}  # 글자 검색에 걸려 AI까지 가야 함
    res, saved = run_chat(monkeypatch, q, [chunk])
    assert "학교 자료에 없어서" in res.json()["message"]["text"]
    assert res.json()["message"]["sources"] == []
    assert any(t == "unanswered_questions" and b["question"] == q for _, t, b in saved)


def test_answer_keeps_points_and_normalizes_bullets(monkeypatch):
    monkeypatch.setattr(tasks, "_ask", lambda *_: {"answer": "휴학은 5년까지 가능합니다.\n- 한 번에 1학기입니다\n• 휴학원 제출\n· 기간 안에 합니다."})
    assert tasks.answer_from_docs("휴학", [{"content": "휴학 5년 1학기"}]) == "휴학은 5년까지 가능해요.\n· 한 번에 1학기예요\n· 휴학원 제출\n· 기간 안에 해요."


def test_system_word_is_not_me():
    assert tasks._route_by_rule("학점 제도 알려줘") is None  # "제도"의 '제'를 나로 읽어 내 졸업 정보로 답하던 문제


def test_week_calendar_lists_overlapping_events(monkeypatch):
    monkeypatch.setattr(chat_route, "_today", lambda: date(2026, 10, 31))  # 토요일 → 10/26(월)~11/1(일)
    calendar = [{"title": "걸친 일정", "start_date": "2026-10-20", "end_date": "2026-10-26"},
                {"title": "주 안 일정", "start_date": "2026-11-01", "end_date": "2026-11-01"},
                {"title": "지난 일정", "start_date": "2026-10-01", "end_date": "2026-10-25"},
                {"title": "다음 주 일정", "start_date": "2026-11-02", "end_date": "2026-11-03"},
                {"title": "1학년 일정", "start_date": "2026-10-27", "end_date": "2026-10-27", "target_grades": [1]}]
    msg = run_chat(monkeypatch, "이번 주 학사일정 알려줘", [], calendar=calendar)[0].json()["message"]
    assert "2026년 10월 26일 월요일 ~ 2026년 11월 1일 일요일" in msg["text"]
    assert "걸친 일정" in msg["text"] and "주 안 일정" in msg["text"]
    assert not any(t in msg["text"] for t in ("지난 일정", "다음 주 일정", "1학년 일정"))  # 프로필은 4학년
    msg = run_chat(monkeypatch, "다음 주 일정 뭐 있어?", [], calendar=calendar)[0].json()["message"]
    assert "2026년 11월 2일 월요일" in msg["text"] and "다음 주 일정" in msg["text"]


def test_empty_week_does_not_claim_no_school_events(monkeypatch):
    monkeypatch.setattr(chat_route, "_today", lambda: date(2026, 10, 31))
    res, saved = run_chat(monkeypatch, "이번 주 학사일정 알려줘", [])
    assert "2026년 10월 26일" in res.json()["message"]["text"] and "확인되지 않았어요" in res.json()["message"]["text"]
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


def test_deadline_note_uses_kst_and_never_says_no_deadline():
    note = chat_route._deadline_note
    assert note("2099-11-10T14:59:00+00:00") == "마감 2099년 11월 10일 23:59, 아직 안 지남"
    assert note("2020-11-16T09:00:00+00:00") == "마감 2020년 11월 16일 18:00, 이미 지남"
    assert note(None) == "마감일 확인 필요"


def test_expired_notice_is_told_first(monkeypatch):
    notice = {"title": "두을장학생 선발", "summary": [], "body": "두을장학생 선발 신청", "url": "https://example.com/n/2", "deadline": "2020-09-30T14:59:00+00:00"}
    res, _ = run_chat(monkeypatch, "이거 신청 방법 알려줘", [], {"kind": "notice", "id": 2}, notices=[notice])
    msg = res.json()["message"]
    assert msg["text"].startswith("이 공지는 마감이 지났어요.")
    assert msg["sources"] == [{"title": "두을장학생 선발", "url": "https://example.com/n/2"}]


def test_undated_notice_cannot_be_called_open(monkeypatch):
    monkeypatch.setattr(tasks, "_ask", lambda *a, **k: {"subject": None, "answer": "마감일이 지나지 않았으니 신청하세요."})
    assert tasks.answer_from_docs("신청돼?", [{"content": "[공지] 인재육성 장학생 (마감일 확인 필요)\n선발 안내"}]) is None
    assert tasks.answer_from_docs("신청돼?", [{"content": "[공지] 인재육성 장학생 (마감 2099년 1월 1일 23:59, 아직 안 지남)"}])


TITLES = [{"id": 57, "title": "2027년도 대산농촌재단 장학생 선발 안내"}, {"id": 47, "title": "2026년도 통영시 저소득 대학생 장학금 지원대상자 선발 안내"},
          {"id": 3, "title": "2026학년도 2학기 학점포기 신청 안내"}, {"id": 17, "title": "2026학년도 동계계절학기 학점교류대학 수강신청 안내"},
          {"id": 29, "title": "2026학년도 2학기 전과, 재입학 발표안내"}]


@pytest.mark.parametrize("q, found", [
    ("대산농촌재단 장학금 마감 언제야?", 57), ("대산농촌재단 아직 신청할 수 있어?", 57), ("통영시 장학금 서류 뭐 내야 돼?", 47), ("학점포기 언제까지야?", 3),
    ("수강신청 언제야?", None), ("계절학기 몇 학점까지 들어?", None), ("전과 조건 알려줘", None), ("휴학 신청 언제야?", None), ("나 장학금 받을 수 있어?", None), ("성적우수 장학금 조건이 뭐야?", None)])
def test_pick_notice_by_name_only(q, found):
    hit = chat_route._pick_notice(TITLES, q)
    assert (hit and hit["id"]) == found


def test_chat_finds_named_notice_without_context(monkeypatch):
    notice = {"id": 57, "title": TITLES[0]["title"], "summary": [], "body": "대산농촌재단 장학생 선발. 접수 기간 2099-11-11까지", "url": "https://example.com/57", "deadline": "2099-11-11T14:59:00+00:00"}
    res, saved = run_chat(monkeypatch, "대산농촌재단 장학금 마감 언제야?", [], notices=[notice])
    msg = res.json()["message"]
    assert "2099" in msg["text"] and msg["sources"] == [{"title": notice["title"], "url": notice["url"]}]
    assert not any(t == "unanswered_questions" for _, t, _ in saved)


def test_follow_up_keeps_named_notice(monkeypatch):
    notice = {"id": 57, "title": TITLES[0]["title"], "summary": [], "body": "대산농촌재단 장학생 선발. 제출서류 신청서", "url": "https://example.com/57", "deadline": None}
    res, _ = run_chat(monkeypatch, "그럼 서류는?", [], notices=[notice], history=[{"text": "대산농촌재단 장학금 언제까지야?", "id": 1}])
    assert res.json()["message"]["sources"][0]["url"] == "https://example.com/57"


def test_notice_list_shows_open_notices_with_sources(monkeypatch):
    rows = [{"title": "강의평가 안내", "url": "https://example.com/4", "deadline": "2099-11-02T14:59:00+00:00", "target": {}},
            {"title": "교원 초빙", "url": "https://example.com/9", "deadline": "2099-11-03T14:59:00+00:00", "target": {"statuses": ["staff"]}}]
    res, _ = run_chat(monkeypatch, "최근 공지 뭐 있어?", [], notices=rows)
    msg = res.json()["message"]
    assert "강의평가 안내: 2099년 11월 2일까지" in msg["text"] and "교원 초빙" not in msg["text"]
    assert msg["sources"] == [{"title": "강의평가 안내", "url": "https://example.com/4"}]


def _my_info(monkeypatch, topic, tables):
    calls = []
    async def fake_rows(request, method, table, **kw):
        calls.append((table, kw["params"]))
        return tables.get(table, [])
    monkeypatch.setattr(chat_route, "database_rows", fake_rows)
    monkeypatch.setattr(tasks, "_ask", lambda *a, **k: pytest.fail("내 정보 답변은 AI를 안 부름"))
    return asyncio.run(chat_route._my_info(None, SimpleNamespace(id=USER_ID), {"department": "소프트웨어학과"}, topic)), calls


def test_my_todos_have_sources_and_skip_overdue(monkeypatch):
    todos = [{"title": "인재육성 장학생", "due_date": None, "source_id": 66}, {"title": "책 반납", "due_date": None, "source_id": None},
             {"title": "강의평가", "due_date": "2099-11-02", "source_id": 4}]
    notices = [{"title": "인재육성 장학생", "url": "https://example.com/66"}, {"title": "강의평가", "url": "https://example.com/4"}]
    reply, calls = _my_info(monkeypatch, "todo", {"todos": todos, "notices": notices})
    assert "인재육성 장학생: 마감일 확인 필요" in reply["text"] and "책 반납: 마감 없음" in reply["text"] and "2099년 11월 2일까지" in reply["text"]
    assert reply["sources"] == notices
    params = dict(calls)
    assert params["todos"]["or"].startswith("(due_date.gte.") and params["notices"]["id"] == "in.(66,4)"


def test_my_scholarships_have_sources_and_links(monkeypatch):
    async def fake_scholarships(request, user):
        return [{"title": "인재육성 장학생", "verdict": "check", "deadline": None, "url": "https://example.com/66", "applied": False, "reasons": []}]
    monkeypatch.setattr(chat_route, "scholarship_rows", fake_scholarships)
    reply, _ = _my_info(monkeypatch, "scholarship", {})
    assert reply["sources"] == [{"title": "인재육성 장학생", "url": "https://example.com/66"}]
    assert reply["cards"][0]["lines"] == ["확인 필요", "마감일 확인 필요"] and reply["cards"][0]["link"] == "https://example.com/66"


def test_chat_scholarship_cards_skip_regional_and_put_eligible_first():
    from server.routes.chat import _pick_scholarships
    def row(title, verdict="check", deadline="2026-12-01", applied=False):
        return {"title": title, "verdict": verdict, "deadline": deadline, "applied": applied}
    rows = [row("2026년 2학기 안산시 대학생 등록금 지원"), row("거창군 지역출신 대학생 지원"), row("연구 장학생 모집", deadline="2026-11-01"),
            row("성적우수장학금", "eligible", "2026-12-20"), row("지난 장학금", deadline="2026-01-01"), row("미충족", "ineligible"), row("낸 것", applied=True),
            row("푸른등대 기부장학금", deadline=None)]
    picked, regional = _pick_scholarships(rows, "2026-10-30")
    assert [r["title"] for r in picked] == ["성적우수장학금", "연구 장학생 모집", "푸른등대 기부장학금"]
    assert regional == 2
