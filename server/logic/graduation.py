"""입력 성적에 대한 최소 졸업요건 점검. 최종 졸업 가능 판정은 하지 않는다."""
import re
import unicodedata
from decimal import Decimal
from server.logic.graduation_display import clean_label


def normalized_name(value: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value)).casefold()


MAJOR_AREAS = {normalized_name(name) for name in ("전공", "전공기초", "전공핵심", "전공심화", "전공필수", "전공선택")}
GENERAL_AREAS = {normalized_name(name) for name in ("교양", "교양필수", "핵심역량교양필수", "교양선택", "기초학문교양선택", "균형교양", "자유선택")}


def calculate_graduation(rows: list[dict], rules: dict) -> dict:
    passed = [row for row in rows if row["grade"] not in ("F", "NP")]
    names = [normalized_name(row["course_name"]) for row in passed]
    # 동일 과목의 중복 이수·재수강 대체 여부를 현재 입력 필드로 확정할 수 없다.
    ambiguous = len(names) != len(set(names))
    total = sum((Decimal(str(row["credits"])) for row in passed), Decimal(0))
    areas = []
    for area in rules["areas"]:
        aliases = MAJOR_AREAS if area["name"] == "전공" else GENERAL_AREAS if area["name"] == "교양" else {normalized_name(area["name"])}
        earned = sum((Decimal(str(row["credits"])) for row in passed if normalized_name(row["area"]) in aliases), Decimal(0))
        areas.append({"name": area["name"], "required": area["required"], "earned": None if ambiguous else float(earned)})

    requirements = []
    for course in rules["required_courses"]:
        requirements.append({"name": clean_label(course["name"]) if '\n' not in course['name'] else '\n'.join(clean_label(line) for line in course['name'].splitlines()), "done": None if course.get("manual") else normalized_name(course["name"]) in names})
    requirements.extend({"name": clean_label(name) or "세부 졸업요건 확인", "done": None} for name in rules["certifications"])
    if ambiguous:
        requirements.append({"name": "재수강·중복 과목의 인정 학점 확인", "done": None})
    required = Decimal(str(rules["total_credits"]))
    return {"required_total": float(required), "earned_total": None if ambiguous else float(total),
            "remaining_total": None if ambiguous else float(max(required - total, Decimal(0))),
            "areas": areas, "requirements": requirements}
