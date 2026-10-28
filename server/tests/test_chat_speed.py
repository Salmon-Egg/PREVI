"""챗봇 속도·길이: 뻔한 질문은 코드로 분류, 긴 답은 문장 끝에서 자름."""
import pytest

from server.ai import tasks


@pytest.mark.parametrize("q, want", [
    ("나 장학금 받을 수 있어?", ("my_info", "scholarship")),
    ("내가 신청할 수 있는 장학금 있어?", ("my_info", "scholarship")),
    ("졸업까지 몇 학점 남았어?", ("my_info", "graduation")),
    ("나 졸업할 수 있어?", ("my_info", "graduation")),
    ("이번 주에 내가 할 일 뭐야?", ("my_info", "todo")),
    ("성적우수 장학금 조건이 뭐야?", ("document", None)),
    ("휴학하면 장학금은 어떻게 돼?", ("document", None)),
    ("계절학기는 몇 학점까지 들을 수 있어?", ("document", None)),
    ("[휴학 신청] 기간 안내\n질문: 신청 기간이 언제야?", ("document", None)),
])
def test_rule_routes_obvious_questions(q, want):
    out = tasks._route_by_rule(q.rsplit("질문:", 1)[-1])
    assert (out["intent"], out["topic"]) == want


def test_article_number_is_not_me():
    assert tasks._route_by_rule("제 30조 휴학 기간이 뭐야?") == {"intent": "document", "topic": None}
    assert tasks._route_by_rule("제가 받을 수 있는 장학금 있어?")["intent"] == "my_info"


def test_same_reason_reuses_ai_text(monkeypatch):
    calls = []
    monkeypatch.setattr(tasks, "_REASONS", {})
    monkeypatch.setattr(tasks, "_ask", lambda *a, **k: calls.append(a) or {"text": "3학년이라 대상이에요."})
    for _ in range(3):
        assert tasks.explain_reason("장학", "eligible", ["3학년 ✓"]) == "3학년이라 대상이에요."
    assert len(calls) == 1
    monkeypatch.setattr(tasks, "_ask", lambda *a, **k: None)  # AI 실패는 저장 안 함
    assert tasks.explain_reason("장학", "check", ["토익 — 직접 확인이 필요해요"]) == "토익 — 직접 확인이 필요해요"
    assert ("장학", "check", ("토익 — 직접 확인이 필요해요",)) not in tasks._REASONS


def test_broken_json_retry_shows_bad_answer(monkeypatch):
    from types import SimpleNamespace as NS
    from server.ai import client
    sent = []

    def create(**kw):
        sent.append([m["content"] for m in kw["messages"]])
        return NS(choices=[NS(message=NS(content='{"answer": "ok"}' if len(sent) == 2 else "깨진 답"))])
    monkeypatch.setattr(client, "AI_FAKE", False)
    monkeypatch.setattr(client, "_client", lambda: NS(chat=NS(completions=NS(create=create))))
    assert client.ask_json("chat_answer", "{}") == {"answer": "ok"}
    assert sent[1][-2:] == ["깨진 답", "올바른 JSON 하나로만 다시 답해."]


@pytest.mark.parametrize("q", ["마감 임박한 거 있어?", "나 휴학하면 장학금 어떻게 돼?"])
def test_unclear_goes_to_ai(q):
    assert tasks._route_by_rule(q) is None


def test_ai_topic_outside_set_goes_to_documents(monkeypatch):
    monkeypatch.setattr(tasks, "_ask", lambda *a, **k: {"intent": "my_info", "topic": "grades"})
    assert tasks.route_question("요즘 내 상황 좀 봐줘") == {"intent": "document", "topic": None}


def test_made_up_number_becomes_unknown(monkeypatch):
    chunks = [{"content": "휴학기간은 1회 1학기 이내로 하며, 통산 6학기를 넘을 수 없다."}]
    monkeypatch.setattr(tasks, "_ask", lambda *a, **k: {"answer": "휴학은 통산 8학기까지 돼요."})
    assert tasks.answer_from_docs("휴학 최대?", chunks) is None
    monkeypatch.setattr(tasks, "_ask", lambda *a, **k: {"answer": "한 번에 1학기, 모두 합쳐 6학기까지 돼요."})
    assert tasks.answer_from_docs("휴학 최대?", chunks) == "한 번에 1학기, 모두 합쳐 6학기까지 돼요."
    monkeypatch.setattr(tasks, "_ask", lambda *a, **k: {"answer": "2023학번은 6학기까지 돼요."})
    assert tasks.answer_from_docs("휴학 최대?", chunks, {"입학년도": 2023})  # 학생 정보 숫자는 허용


def test_short_cuts_at_sentence_end():
    text = "평점 3.5 이상이면 신청할 수 있어요. " + "가" * 200
    assert tasks._short(text, 150) == "평점 3.5 이상이면 신청할 수 있어요."
    assert tasks._short("가" * 200, 100) == "가" * 100 + "…"
    assert tasks._short("짧은 답.", 100) == "짧은 답."
    assert tasks._short(None, 100) is None
