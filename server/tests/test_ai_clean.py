"""AI가 낸 공지 대상·조건을 대조 코드가 읽는 모양으로 바꾸는지 확인."""
from server.ai import tasks
from server.ai.tasks import clean_conditions, clean_target


def test_summary_moves_non_department_to_unknown(monkeypatch):
    monkeypatch.setattr(tasks, "_ask", lambda *_: {"target": {"departments": ["신입생", "경영학과"]}, "conditions": {}})
    s = tasks.summarize_notice("제목", "본문")
    assert s["target"]["departments"] == ["경영학과"]
    assert s["conditions"] == {"unknown": ["신입생"]}


def test_scholarship_without_any_condition_needs_check(monkeypatch):
    monkeypatch.setattr(tasks, "_ask", lambda *_: {"category": "장학", "target": {}, "conditions": {}})
    assert tasks.summarize_notice("제목", "본문")["conditions"] == {"unknown": ["자격 조건은 첨부 공고문 확인"]}


def test_cumulative_numbers_leave_last_semester_slots(monkeypatch):
    monkeypatch.setattr(tasks, "_ask", lambda *_: {"category": "학사", "conditions": {
        "min_gpa": 3.5, "min_credits": 33, "unknown": ["1학년(33학점) 이상 수료", "평점 3.5 이상"]}})
    assert tasks.summarize_notice("교환학생", "")["conditions"] == {"unknown": ["1학년(33학점) 이상 수료", "평점 3.5 이상"]}
    monkeypatch.setattr(tasks, "_ask", lambda *_: {"category": "장학", "conditions": {
        "min_gpa": 4.0, "unknown": ["직전학기 평점 4.0 이상", "토익 900점"]}})
    assert tasks.summarize_notice("장학", "")["conditions"]["min_gpa"] == 4.0


def test_conditions_drop_zero_and_procedure_text():
    c = clean_conditions({"min_credits": 0, "income_max": 0, "unknown": ["장애학생", "등록금 범위 안에서 이중수혜 가능", "장학과로 문의"]})
    assert c == {"unknown": ["장애학생"]}


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
    assert clean_target({"grades": [4, 3, 2, 1]})["grades"] == []
