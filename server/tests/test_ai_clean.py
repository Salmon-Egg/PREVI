"""AI가 낸 공지 대상·조건을 대조 코드가 읽는 모양으로 바꾸는지 확인."""
import pytest

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
    assert tasks.summarize_notice("장학", "직전학기 평점 4.0 이상")["conditions"]["min_gpa"] == 4.0


@pytest.mark.parametrize("stored, body, kept", [
    ({"min_credits": 12}, "이수학점 : 12\n학점 ( 주전공 48학점 이상 이수 )", {}),  # 38 과정 이수학점
    ({"min_credits": 12}, "수강신청 학점이 12 학점 미만으로 철회 불가", {}),  # 22
    ({"min_credits": 33}, "본교에서 1학년(33학점) 이상 수료한 자", {}),  # 18
    ({"min_gpa": 3.0}, "학업성적 평균 C 학점 이상 (2026년 1학기 성적 기준)", {}),  # 47 원문에 없는 숫자
    ({"min_gpa": 3.5}, "직전 학기까지 누계 평균 평점 3.5 이상", {}),  # 57
    ({"min_gpa": 3.5}, "학업성적이 평균 3.5 이상인 자", {}),  # 18
    ({"min_gpa": 3.0, "min_credits": 12}, "직전학기 12학점 이상 이수하고 평균 B(3.0) 학점 이상, 12학점 이상 이수하고 평균 A(4.0) 학점 이상", {}),  # 63
    ({"min_gpa": 3.5, "min_credits": 15}, "26년 정규 1학기 총 15학점 이상을 이수하고, 성적 3.5/4.5 이상", {"min_gpa": 3.5, "min_credits": 15}),  # 71
    ({"min_gpa": 2.8}, "직전학기 성적이 4.5 만점 기준 2.8 이상 (4.3 만점 기준 2.6 이상)", {"min_gpa": 2.8}),  # 67
    ({"min_credits": 12}, "매 정규학기 12학점 이상 이수", {"min_credits": 12}),  # 55
])
def test_gpa_and_credits_only_when_stated_for_last_term(monkeypatch, stored, body, kept):
    monkeypatch.setattr(tasks, "_ask", lambda *_: {"category": "학사", "conditions": stored})
    conditions = tasks.summarize_notice("안내", body)["conditions"]
    assert {k: v for k, v in conditions.items() if k != "unknown"} == kept
    assert bool(conditions.get("unknown")) == (kept != stored)  # 뺀 조건은 '확인 필요'로 남김


@pytest.mark.parametrize("stored, body, grades", [
    ([1, 2], "미래융합학부1,2: 전공 배정 후 1개 학기 이상 이수한 재학생", []),  # 38
    ([2, 3], "국내 4년제 대학 2학년 2학기 이상 재학생", [2, 3, 4]),  # 57
    ([1, 2], "1학년 2학기 재학 중. 2학년~졸업 시까지 등록금 전액", [1]),  # 71
    ([2, 3, 4], "중학교 3학년 2학기 내신 성적 환산", []),  # 63
    ([1, 2], "2026학년도 입학자", []),
    ([3], "3학년 대상", [3]), ([1, 2], "1·2학년 대상", [1, 2]), ([2, 3], "2~3학년", [2, 3]),
])
def test_target_grades_must_be_stated(monkeypatch, stored, body, grades):
    monkeypatch.setattr(tasks, "_ask", lambda *_: {"category": "학사", "target": {"grades": stored}})
    out = tasks.summarize_notice("안내", body)
    assert out["target"]["grades"] == grades
    assert ("대상 학년은 원문 확인 필요" in out["conditions"].get("unknown", [])) == (not grades)


def test_conditions_drop_zero_and_procedure_text():
    c = clean_conditions({"min_credits": 0, "income_max": 0, "unknown": ["장애학생", "등록금 범위 안에서 이중수혜 가능", "장학과로 문의"]})
    assert c == {"unknown": ["장애학생"]}


def test_conditions_drop_portal_and_mail_procedure():
    c = clean_conditions({"unknown": ["포털에서 신청", "이메일로 신청서 송부", "11월 5일 마감", "국가장학금 1차 신청자", "교원자격 취득 예정자"]})
    assert c == {"unknown": ["국가장학금 1차 신청자", "교원자격 취득 예정자"]}


def test_staff_and_closed_course_notices_match_no_student(monkeypatch):
    from server.logic.eligibility import judge
    student = {"grade": 3, "department": "소프트웨어학과", "status": "enrolled"}
    monkeypatch.setattr(tasks, "_ask", lambda *_: {"category": "장학", "target": {}, "conditions": {}})
    for title in ("2026-2학기 폐강 교과목 안내", "전임교원 초빙 공고", "교직원 건강검진 안내"):
        s = tasks.summarize_notice(title, "")
        assert s["conditions"] == {} and judge(s["target"], s["conditions"], student, None, 0)[0] == "ineligible"
    monkeypatch.setattr(tasks, "_ask", lambda *_: {"conditions": {"unknown": ["교직원 대상 공지"]}})
    assert tasks.summarize_notice("연구윤리 교육", "")["target"]["statuses"] == ["staff"]
    monkeypatch.setattr(tasks, "_ask", lambda *_: {"conditions": {}})
    assert tasks.summarize_notice("교원자격 무시험검정 신청 안내", "")["target"]["statuses"] == []


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
