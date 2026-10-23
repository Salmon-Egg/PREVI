"""D-day, 시간표 중복, 학점 상한, 할 일 우선순위."""
from datetime import date


def d_day(due: date | None, today: date) -> int | None:
    return None if due is None else (due - today).days


def _min(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def find_conflict(new_times: list[dict], entries: list[dict]) -> str | None:
    """새 과목 시간이 기존 시간표와 겹치면 '화 10:30~12:00 소프트웨어공학' 같은 문장, 아니면 None."""
    for e in entries:
        for a in e["times"]:
            for b in new_times:
                if a["day"] == b["day"] and _min(a["start"]) < _min(b["end"]) and _min(b["start"]) < _min(a["end"]):
                    return f"{a['day']} {a['start']}~{a['end']} {e['course_name']}"
    return None


def credit_limit(last_gpa: float | None) -> int:
    """학사요람(예시): 기본 19학점, 직전 학기 평점 4.0 이상이면 21학점."""
    return 21 if last_gpa is not None and last_gpa >= 4.0 else 19


# 놓쳤을 때 피해 크기 1~3. AI가 판단하지 못하면 이 기본값을 씀 (ai/tasks.py severity)
DEFAULT_SEVERITY = {"graduation": 3, "status": 3, "scholarship": 2, "deadline": 1}


def priority(severity: int, dday: int | None) -> int:
    """클수록 위. 피해가 크고 마감이 가까울수록 높음. 마감이 지난 일은 맨 아래."""
    if dday is None:
        return severity * 10
    if dday < 0:
        return -1
    return severity * 10 + max(0, 30 - dday)
