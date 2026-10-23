"""졸업 요건 진행 상황 (GET /graduation 모양)."""
from logic.grades import earned_credits


def progress(requirement: dict, items: list[dict], completed: list[str]) -> dict:
    """requirement: grad_requirements 한 줄, items: 내 성적, completed: 끝낸 인증 이름 목록."""
    earned = earned_credits(items)
    areas = [
        {"name": a["name"], "required": a["required"],
         "earned": earned_credits([i for i in items if i["area"] == a["name"]])}
        for a in requirement["areas"]
    ]
    taken = {i["course_name"] for i in items if i["grade"] != "F"}
    requirements = [{"name": c, "done": c in completed} for c in requirement["certifications"]]
    requirements += [{"name": f"필수 과목: {c}", "done": c in taken} for c in requirement["required_courses"]]
    return {
        "required_total": requirement["total_credits"],
        "earned_total": earned,
        "remaining_total": max(0, requirement["total_credits"] - earned),
        "areas": areas,
        "requirements": requirements,
    }
