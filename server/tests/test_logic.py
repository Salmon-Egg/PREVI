"""장학 판정·우선순위 확인. 성적·졸업·시간표 계산 테스트는 BE A 쪽 test_*.py."""
from datetime import date

import pytest

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


@pytest.mark.parametrize('credits', [12, 15])
def test_semester_credit_exception_never_becomes_unconditional_failure_or_pass(credits):
    conditions = {'min_credits': 15, 'unknown': ['8학기는 12학점 이상']}
    verdict, reasons = eligibility.judge({}, conditions, {**PROFILE, 'grade': 4, 'semester': 2}, 4.0, credits)
    assert verdict == 'check'
    assert any('학기별 예외' in r for r in reasons)
    assert conditions == {'min_credits': 15, 'unknown': ['8학기는 12학점 이상']}


def test_credit_exception_in_original_notice_survives_ai_omission():
    verdict, reasons = eligibility.judge({}, {'min_credits': 15}, PROFILE, 4.0, 12,
        source_text='직전 학기 15학점 이상 이수. 단, 8학기는 12학점 이상.')
    assert verdict == 'check'
    assert any('8학기는 12학점' in r for r in reasons)


def test_unconditional_credit_requirement_still_decides():
    assert eligibility.judge({}, {'min_credits': 15}, PROFILE, 4.0, 12,
        source_text='직전 학기 15학점 이상 이수')[0] == 'ineligible'
    assert eligibility.judge({}, {'min_credits': 15}, PROFILE, 4.0, 15,
        source_text='직전 학기 15학점 이상 이수')[0] == 'eligible'


@pytest.mark.parametrize('source', ['토익 700점 이상', 'TOEIC 성적 800점 이상', '학사경고를 받지 않은 학생'])
def test_missing_language_or_warning_information_requires_review(source):
    verdict, reasons = eligibility.judge({}, {'min_gpa': 3.0}, PROFILE, 4.0, 15, source_text=source)
    assert verdict == 'check'
    assert any(source in r for r in reasons)


def test_known_failure_remains_failure_despite_credit_exception():
    assert eligibility.judge({}, {'min_gpa': 4.0, 'min_credits': 15}, PROFILE, 3.0, 12,
        source_text='직전 15학점, 8학기는 12학점 이상')[0] == 'ineligible'


def test_toeic_schedule_alone_is_not_an_eligibility_condition():
    assert eligibility.judge({}, {}, PROFILE, 4.0, 15, source_text='토익 접수 마감 11월 5일')[0] == 'eligible'
