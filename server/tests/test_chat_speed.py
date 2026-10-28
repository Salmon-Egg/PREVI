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


@pytest.mark.parametrize("q", ["마감 임박한 거 있어?", "나 휴학하면 장학금 어떻게 돼?"])
def test_unclear_goes_to_ai(q):
    assert tasks._route_by_rule(q) is None


def test_short_cuts_at_sentence_end():
    text = "평점 3.5 이상이면 신청할 수 있어요. " + "가" * 200
    assert tasks._short(text, 150) == "평점 3.5 이상이면 신청할 수 있어요."
    assert tasks._short("가" * 200, 100) == "가" * 100 + "…"
    assert tasks._short("짧은 답.", 100) == "짧은 답."
    assert tasks._short(None, 100) is None
