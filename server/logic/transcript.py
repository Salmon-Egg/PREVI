"""AI가 성적증명서에서 옮긴 줄을 성적 입력 모양으로 검사한다. 저장은 학생이 미리보기를 확인한 뒤 앱이 한다."""
import re

GRADES = {"A+", "A0", "B+", "B0", "C+", "C0", "D+", "D0", "F", "P"}
ALIASES = {"A": "A0", "B": "B0", "C": "C0", "D": "D0", "PASS": "P", "합격": "P", "NP": "F"}
# 앱의 이수 영역 네 가지로. 모르는 구분은 글자 그대로 두고 미리보기에서 학생이 봄
AREAS = {"전필": "전공 필수", "전공필수": "전공 필수", "전핵": "전공 필수", "전공핵심": "전공 필수",
         "전선": "전공 선택", "전공선택": "전공 선택", "전심": "전공 선택", "전공심화": "전공 선택", "전공": "전공 선택", "전기": "전공 선택",
         "교필": "교양 필수", "교양필수": "교양 필수", "핵심역량교양필수": "교양 필수",
         "교선": "교양 선택", "교양선택": "교양 선택", "기초학문교양선택": "교양 선택", "자유선택": "교양 선택", "일선": "교양 선택"}


def clean_courses(rows: list, admission_year: int) -> tuple[list[dict], int]:
    """(넣을 수 있는 과목, 버린 줄 수). 수강 연도 - 입학년도로 학년을 정함.
    shortcut: 휴학하면 학년이 실제보다 높게 나옴. 미리보기에서 학생이 고칠 수 있어야 정확해짐."""
    items, dropped = {}, 0
    for row in rows:
        try:
            year, semester = int(row["year"]), int(row["semester"])  # 계절학기("계절")는 여기서 걸러짐: 학기 칸이 없음
            credits = float(row["credits"])
            name = str(row["name"]).strip()
            grade = str(row["grade"]).strip().upper()
        except (KeyError, TypeError, ValueError):
            dropped += 1
            continue
        grade = ALIASES.get(grade, grade)
        level = year - admission_year + 1
        if grade not in GRADES or not 1 <= level <= 6 or semester not in (1, 2) or not 0 < credits <= 30 or not 1 <= len(name) <= 200:
            dropped += 1
            continue
        area = re.sub(r"\s+", "", str(row.get("area") or ""))
        items[(level, semester, name)] = {"term": f"{level}-{semester}", "course_name": name, "credits": credits, "grade": grade,
                                          "area": AREAS.get(area, area) or "교양 선택"}
    return list(items.values()), dropped
