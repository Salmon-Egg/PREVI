"""요람에서 옮긴 학과별 전공 필수 과목 자료."""
from server.logic.graduation import calculate_graduation
from server.scripts.load_major_required import entries, merged

COMMON = {"name": "학과 지정 필수과목 확인", "manual": True}


def rule(department="컴퓨터소프트웨어전공", year=2025, courses=()):
    return {"department": department, "admission_year": year, "required_courses": [*courses, COMMON]}


def test_every_entry_is_well_formed_and_years_do_not_overlap():
    seen = set()
    for entry in entries():
        assert entry["courses"] and (entry["pages"] or entry["handbook"] == "학과")
        assert len(set(entry["courses"])) == len(entry["courses"]), entry["department"]
        assert all(y <= 2024 for y in entry["years"]) or all(y >= 2025 for y in entry["years"])
        for year in entry["years"]:
            assert (entry["department"], year) not in seen
            seen.add((entry["department"], year))


def test_major_courses_go_first_and_applying_twice_changes_nothing():
    once = merged(rule(), entries())
    assert [c["name"] for c in once[:4]] == ["운영체제", "알고리즘및실습", "데이터베이스", "소프트웨어공학"]
    assert once[-1] == COMMON
    assert merged({**rule(), "required_courses": once}, entries()) == once


def test_other_years_and_departments_are_untouched():
    assert merged(rule(year=2024), entries()) == [COMMON]  # 이 학과는 2025학번부터
    assert merged(rule("자유전공학부"), entries()) == [COMMON]  # 요람에 과목 이름이 없음


def test_conflicting_handbook_text_stays_as_a_check_item():
    names = merged(rule("영화영상학과"), entries())
    assert next(c for c in names if c.get("manual") and "학과 확인" in c["name"])


def test_major_courses_show_as_remaining_on_graduation_screen():
    courses = merged(rule(), entries())
    row = {"term": "2-2", "course_name": "운영 체제", "credits": 3, "grade": "A0", "area": "전공심화"}
    result = calculate_graduation([row], {"total_credits": 130, "areas": [], "required_courses": courses, "certifications": []})
    done = {r["name"]: r["done"] for r in result["requirements"]}
    assert done["운영체제"] is True and done["데이터베이스"] is False and done["학과 지정 필수과목 확인"] is None


def test_department_without_course_list_gets_a_warning():
    rules = {"total_credits": 120, "areas": [], "required_courses": [COMMON], "certifications": []}
    assert calculate_graduation([], rules)["requirements"][0] == {"name": "전공 필수 과목은 요람에 목록이 없어요. 학과에 확인해 주세요", "done": None}
    listed = {**rules, "required_courses": [{"name": "운영체제"}, COMMON]}
    assert "요람에 목록이" not in calculate_graduation([], listed)["requirements"][0]["name"]
