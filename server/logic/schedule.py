"""D-day, 시간표 중복, 학점 상한, 할 일 우선순위."""
from datetime import date


def d_day(due: date | None, today: date) -> int | None:
    return None if due is None else (due - today).days


def _min(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def find_conflict(new_times: list[dict], entries: list[dict]) -> dict | None:
    """새 과목 시간이 기존 시간표와 겹치면 {course_name, day, start, end}(겹치는 구간), 아니면 None."""
    for e in entries:
        for a in e["times"]:
            for b in new_times:
                if a["day"] == b["day"] and _min(a["start"]) < _min(b["end"]) and _min(b["start"]) < _min(a["end"]):
                    start = max(a["start"], b["start"])
                    end = min(a["end"], b["end"])
                    return {"course_name": e["course_name"], "day": a["day"], "start": start, "end": end}
    return None


def periods(start: str, end: str) -> str:
    """'10:00','13:00' → '02, 03, 04교시' (01교시 = 09:00). 정시가 아니면 '10:30~12:00'."""
    s, e = _min(start), _min(end)
    if s % 60 or e % 60 or s < 9 * 60:
        return f"{start}~{end}"
    return ", ".join(f"{h - 8:02d}" for h in range(s // 60, e // 60)) + "교시"


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
