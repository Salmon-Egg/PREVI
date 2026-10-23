"""계산 함수 확인. server/ 폴더에서 `python -m pytest` 로 실행."""
from datetime import date

from logic import eligibility, graduation, grades, schedule

HONG_REQ = {
    "total_credits": 130,
    "areas": [{"name": "전공", "required": 66}, {"name": "교양 필수", "required": 18}],
    "required_courses": ["캡스톤디자인II"],
    "certifications": ["졸업 영어 인증", "졸업작품 심사 신청"],
}


def g(term, credits, grade, area="전공", name="과목"):
    return {"term": term, "credits": credits, "grade": grade, "area": area, "course_name": name}


def test_gpa_skips_pass_and_counts_f():
    items = [g("1-1", 3, "A+"), g("1-1", 3, "F"), g("1-1", 1, "P")]
    assert grades.gpa(items) == 2.25
    assert grades.earned_credits(items) == 4


def test_last_term_uses_latest():
    items = [g("1-2", 3, "C0"), g("2-1", 3, "A+"), g("2-1", 3, "A0")]
    assert grades.last_term(items) == (4.25, 6)


def test_graduation_progress():
    items = [g("4-1", 3, "A+", "전공", "캡스톤디자인I"), g("1-1", 3, "B0", "교양 필수"), g("1-1", 3, "F")]
    p = graduation.progress(HONG_REQ, items, ["졸업 영어 인증"])
    assert p["earned_total"] == 6 and p["remaining_total"] == 124
    assert p["areas"][0] == {"name": "전공", "required": 66, "earned": 3}
    assert {"name": "졸업작품 심사 신청", "done": False} in p["requirements"]
    assert {"name": "필수 과목: 캡스톤디자인II", "done": False} in p["requirements"]


PROFILE = {"grade": 2, "department": "소프트웨어학과", "status": "enrolled"}


def test_scholarship_eligible():
    verdict, reasons = eligibility.judge({"statuses": ["enrolled"]}, {"min_gpa": 3.5, "min_credits": 12}, PROFILE, 4.2, 15)
    assert verdict == "eligible"
    assert reasons[1] == "직전 학기 평점 4.2 (기준 3.5 이상) ✓"


def test_scholarship_ineligible_and_check():
    assert eligibility.judge({}, {"min_gpa": 3.5}, PROFILE, 3.1, 15)[0] == "ineligible"
    assert eligibility.judge({}, {"income_max": 8}, PROFILE, 3.1, 15)[0] == "check"
    assert eligibility.judge({}, {"min_gpa": 3.5}, PROFILE, None, 0)[0] == "check"


def test_target_match():
    assert eligibility.matches_target({"grades": [4]}, PROFILE) is False
    assert eligibility.matches_target({"statuses": ["enrolled"]}, {**PROFILE, "status": "returned"}) is True
    assert eligibility.matches_target({}, PROFILE) is True


def test_conflict_and_limits():
    entries = [{"course_name": "서경인성리더십", "times": [{"day": "금", "start": "12:00", "end": "13:00"}]}]
    hit = schedule.find_conflict([{"day": "금", "start": "10:00", "end": "13:00"}], entries)
    assert hit == {"course_name": "서경인성리더십", "day": "금", "start": "12:00", "end": "13:00"}
    assert schedule.find_conflict([{"day": "금", "start": "13:00", "end": "14:00"}], entries) is None
    assert schedule.periods("10:00", "13:00") == "02, 03, 04교시"
    assert schedule.periods("10:30", "12:00") == "10:30~12:00"
    assert schedule.credit_limit(4.0) == 21 and schedule.credit_limit(3.9) == 19


def test_dday_and_priority():
    today = date(2026, 10, 23)
    assert schedule.d_day(date(2026, 10, 30), today) == 7
    assert schedule.priority(3, 0) > schedule.priority(1, 0) > schedule.priority(3, -1)
