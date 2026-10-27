"""AI가 낸 공지 대상·조건을 대조 코드가 읽는 모양으로 바꾸는지 확인."""
from server.ai.tasks import clean_conditions, clean_target


def test_conditions_text_numbers_become_numbers():
    assert clean_conditions({"min_gpa": "3.0", "min_credits": "15", "income_max": 8}) == {
        "min_gpa": 3.0, "min_credits": 15, "income_max": 8}


def test_conditions_drops_non_numbers_and_bad_shape():
    assert clean_conditions({"min_gpa": "높음", "min_credits": None}) == {}
    assert clean_conditions(["min_gpa"]) == {}


def test_conditions_keeps_unknown_text():
    assert clean_conditions({"min_gpa": 3.0, "unknown": ["토익 700점 이상", " ", None]}) == {
        "min_gpa": 3.0, "unknown": ["토익 700점 이상"]}
    assert "unknown" not in clean_conditions({"unknown": []})


def test_target_short_department_and_korean_status():
    t = clean_target({"grades": [3, "4", 9], "departments": ["소프트웨어", "경영학과", ""], "statuses": ["재학생", "졸업생"]})
    assert t == {"grades": [3, 4], "departments": ["소프트웨어학과", "경영학과"], "statuses": ["enrolled"]}


def test_target_missing_means_everyone():
    assert clean_target(None) == {"grades": [], "departments": [], "statuses": []}
