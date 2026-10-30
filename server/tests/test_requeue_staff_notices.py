"""예전 규칙으로 해석된 교수·폐강 공지만 다시 해석 대상으로 고르는지 확인."""
from server.scripts.requeue_staff_notices import stale


def test_picks_only_old_staff_notices():
    notices = [
        {"id": 1, "title": "2026-2학기 폐강 교과목 안내", "target": {"statuses": []}, "conditions": {}},
        {"id": 2, "title": "연구윤리 교육", "target": {}, "conditions": {"unknown": ["교직원 대상 공지"]}},
        {"id": 3, "title": "전임교원 초빙 공고", "target": {"statuses": ["staff"]}, "conditions": {}},  # 이미 새 규칙
        {"id": 4, "title": "교원자격 무시험검정 신청 안내", "target": {}, "conditions": {}},  # 학생 공지
        {"id": 5, "title": "성적우수 장학금", "target": None, "conditions": None},
    ]
    assert [n["id"] for n in stale(notices)] == [1, 2]
