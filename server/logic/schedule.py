"""D-day, 할 일 우선순위 (④). 시간표 중복·학점 상한은 logic/timetable.py."""
from datetime import date


def d_day(due: date | None, today: date) -> int | None:
    return None if due is None else (due - today).days


# 놓쳤을 때 피해 크기 1~3. AI가 판단하지 못하면 이 기본값을 씀 (ai/tasks.py severity)
DEFAULT_SEVERITY = {"graduation": 3, "status": 3, "scholarship": 2, "deadline": 1}


def priority(severity: int, dday: int | None) -> int:
    """클수록 위. 피해가 크고 마감이 가까울수록 높음. 마감이 지난 일은 맨 아래."""
    if dday is None:
        return severity * 10
    if dday < 0:
        return -1
    return severity * 10 + max(0, 30 - dday)
