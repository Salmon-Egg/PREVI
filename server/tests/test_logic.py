"""장학 판정·우선순위 확인. 성적·졸업·시간표 계산 테스트는 BE A 쪽 test_*.py."""
from datetime import date

from server.logic import eligibility, schedule

PROFILE = {"grade": 2, "department": "소프트웨어학과", "status": "enrolled"}


def test_scholarship_eligible():
    verdict, reasons = eligibility.judge({"statuses": ["enrolled"]}, {"min_gpa": 3.5, "min_credits": 12}, PROFILE, 4.2, 15)
    assert verdict == "eligible"
    assert reasons[1] == "직전 학기 평점 4.2 (기준 3.5 이상) ✓"


def test_scholarship_ineligible_and_check():
    assert eligibility.judge({}, {"min_gpa": 3.5}, PROFILE, 3.1, 15)[0] == "ineligible"
    assert eligibility.judge({}, {"income_max": 8}, PROFILE, 3.1, 15)[0] == "check"
    assert eligibility.judge({}, {"min_gpa": 3.5}, PROFILE, None, 0)[0] == "check"


def test_unknown_condition_is_check():
    verdict, reasons = eligibility.judge({}, {"min_gpa": 3.0, "unknown": ["토익 700점 이상"]}, PROFILE, 3.5, 15)
    assert verdict == "check"
    assert reasons[-1] == "토익 700점 이상 — 직접 확인이 필요해요"
    # 다른 조건에서 이미 떨어지면 '조건 미충족'이 우선
    assert eligibility.judge({}, {"min_gpa": 4.0, "unknown": ["토익"]}, PROFILE, 3.5, 15)[0] == "ineligible"


def test_target_match():
    assert eligibility.matches_target({"grades": [4]}, PROFILE) is False
    assert eligibility.matches_target({"statuses": ["enrolled"]}, {**PROFILE, "status": "returned"}) is True
    assert eligibility.matches_target({}, PROFILE) is True


def test_dday_and_priority():
    today = date(2026, 10, 23)
    assert schedule.d_day(date(2026, 10, 30), today) == 7
    assert schedule.priority(3, 0) > schedule.priority(1, 0) > schedule.priority(3, -1)
