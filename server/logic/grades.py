from collections import defaultdict
from decimal import Decimal, ROUND_DOWN

POINTS = {"A+": Decimal("4.5"), "A0": Decimal("4.0"), "B+": Decimal("3.5"),
          "B0": Decimal("3.0"), "C+": Decimal("2.5"), "C0": Decimal("2.0"),
          "D+": Decimal("1.5"), "D0": Decimal("1.0"), "F": Decimal("0")}


def semester_gpa(items: list[dict]) -> float | None:
    """P는 제외하고, F는 0점으로 포함하는 학점 가중 평균."""
    credits = sum((Decimal(str(item["credits"])) for item in items if item["grade"] != "P"), Decimal(0))
    if not credits:
        return None
    weighted = sum((Decimal(str(item["credits"])) * POINTS[item["grade"]]
                    for item in items if item["grade"] != "P"), Decimal(0))
    # 서경대 공식 성적 안내: 소수점 셋째 자리 이하 절사.
    return float((weighted / credits).quantize(Decimal("0.01"), rounding=ROUND_DOWN))


def grouped_grades(rows: list[dict]) -> list[dict]:
    groups = defaultdict(list)
    for row in rows:
        groups[row["term"]].append({key: row[key] for key in ("id", "course_name", "credits", "grade", "area")})
    return [{"term": term, "gpa": semester_gpa(groups[term]), "items": groups[term]}
            for term in sorted(groups, key=lambda term: tuple(map(int, term.split("-"))), reverse=True)]
