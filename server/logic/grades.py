"""성적: 평점, 학기별 묶기, 직전 학기."""

POINTS = {"A+": 4.5, "A0": 4.0, "B+": 3.5, "B0": 3.0, "C+": 2.5, "C0": 2.0, "D+": 1.5, "D0": 1.0, "F": 0.0}
# P(통과)는 학점은 인정, 평점 계산에서는 뺌. F는 평점에 넣고 학점은 인정 안 함.


def term_key(term: str) -> tuple[int, int]:
    """'4-1' → (4, 1). 정렬용."""
    year, sem = term.split("-")
    return int(year), int(sem)


def gpa(items: list[dict]) -> float | None:
    scored = [i for i in items if i["grade"] in POINTS]
    credits = sum(i["credits"] for i in scored)
    if credits == 0:
        return None
    return round(sum(POINTS[i["grade"]] * i["credits"] for i in scored) / credits, 2)


def earned_credits(items: list[dict]) -> int:
    return sum(i["credits"] for i in items if i["grade"] != "F")


def by_term(items: list[dict]) -> list[dict]:
    """API 모양: [{term, gpa, items}] 최근 학기가 위."""
    terms = sorted({i["term"] for i in items}, key=term_key, reverse=True)
    out = []
    for t in terms:
        rows = [i for i in items if i["term"] == t]
        out.append({"term": t, "gpa": gpa(rows), "items": rows})
    return out


def last_term(items: list[dict]) -> tuple[float | None, int]:
    """직전 학기(성적이 있는 가장 최근 학기)의 (평점, 이수 학점). 장학 판정·학점 상한에 씀."""
    if not items:
        return None, 0
    t = max((i["term"] for i in items), key=term_key)
    rows = [i for i in items if i["term"] == t]
    return gpa(rows), earned_credits(rows)
