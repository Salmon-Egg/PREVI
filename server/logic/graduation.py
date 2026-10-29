"""입력 성적에 대한 최소 졸업요건 점검. 최종 졸업 가능 판정은 하지 않는다."""
import re
import unicodedata
from decimal import Decimal


def normalized_name(value: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value)).casefold()


MAJOR_AREAS = {normalized_name(name) for name in ("전공", "전공기초", "전공핵심", "전공심화", "전공필수", "전공선택")}
GENERAL_AREAS = {normalized_name(name) for name in ("교양", "교양필수", "핵심역량교양필수", "교양선택", "기초학문교양선택", "균형교양", "자유선택")}


def manual_options(course: dict) -> list[str]:
    """'확인 필요'(manual) 요건 중 과목 이름으로 확인할 수 있는 것: '교양필수 확인: X', '다음 중 1과목 — A / B'."""
    if m := re.match(r"교양필수 확인[:：]\s*(.+)", course["name"]):
        return [m.group(1)]
    details = course.get("details")
    if isinstance(details, str) and "다음 중 1과목" in details and "—" in details:
        return [s.strip() for s in details.split("—", 1)[1].split("/") if s.strip()]
    return []


def calculate_graduation(rows: list[dict], rules: dict, taking: list[dict] = ()) -> dict:
    """taking: 이번 학기 시간표 과목 {course_name, credits, area(모르면 None)}. 학점·완료에는 안 넣고 '수강 중'으로만 보임."""
    passed = [row for row in rows if row["grade"] not in ("F", "NP")]
    names = [normalized_name(row["course_name"]) for row in passed]
    # 동일 과목의 중복 이수·재수강 대체 여부를 현재 입력 필드로 확정할 수 없다.
    ambiguous = len(names) != len(set(names))
    taking = [t for t in taking if normalized_name(t["course_name"]) not in names]
    taking_names = {normalized_name(t["course_name"]) for t in taking}
    total = sum((Decimal(str(row["credits"])) for row in passed), Decimal(0))
    areas = []
    for area in rules["areas"]:
        aliases = MAJOR_AREAS if area["name"] == "전공" else GENERAL_AREAS if area["name"] == "교양" else {normalized_name(area["name"])}
        mine = [row for row in rows if normalized_name(row["area"]) in aliases]
        earned = sum((Decimal(str(row["credits"])) for row in mine if row in passed), Decimal(0))
        areas.append({"name": area["name"], "required": area["required"], "earned": None if ambiguous else float(earned),
                      "courses": [{"term": r["term"], "course_name": r["course_name"], "credits": float(r["credits"]), "grade": r["grade"]} for r in mine],
                      "taking": [{"course_name": t["course_name"], "credits": float(t["credits"])}
                                 for t in taking if t.get("area") and normalized_name(t["area"]) in aliases]})

    requirements = []
    for course in rules["required_courses"]:
        options = [normalized_name(o) for o in manual_options(course)] if course.get("manual") else [normalized_name(course["name"])]
        # 과목명으로 못 찾는 '확인 필요' 요건은 그대로 None (완료로도 미완료로도 보지 않음)
        done = True if any(o in names for o in options) else None if course.get("manual") else False
        item = {"name": course["name"], "done": done}
        if not done and any(o in taking_names for o in options):
            item["taking"] = True
        requirements.append(item)
    requirements.extend({"name": f"확인 필요: {name}", "done": None} for name in rules["certifications"])
    if ambiguous:
        requirements.append({"name": "확인 필요: 같은 이름의 이수 과목이 여러 학기에 있어 중복 학점 인정 여부 확인", "done": None})
    required = Decimal(str(rules["total_credits"]))
    return {"required_total": float(required), "earned_total": None if ambiguous else float(total),
            "remaining_total": None if ambiguous else float(max(required - total, Decimal(0))),
            "areas": areas, "requirements": requirements}
