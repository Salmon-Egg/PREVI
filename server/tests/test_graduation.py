from copy import deepcopy
import json
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from server.config import Settings
from server.logic.graduation import calculate_graduation
from server.main import create_app

USER_ID = str(uuid4())
HEADERS = {"Authorization": "Bearer student-token"}
RULE = {"total_credits": 120, "areas": [{"name": "전공", "required": 48}, {"name": "교양", "required": 33}],
        "required_courses": [{"name": "운영체제"}, {"name": "대체 과목 확인", "manual": True}],
        "certifications": ["졸업작품 심사 결과 확인"]}
GRADE = {"id": 1, "term": "3-1", "course_name": "운영체제", "credits": 3, "grade": "A0", "area": "전공"}
PROFILE = {"department": "소프트웨어학과", "admission_year": 2023, "minor": None}


def test_pass_f_and_area_credit_accounting():
    rows = [GRADE, {**GRADE, "id": 2, "course_name": "실습", "credits": 2, "grade": "P", "area": "전공 핵심"},
            {**GRADE, "id": 3, "course_name": "영어", "credits": 3, "area": "교양 필수"},
            {**GRADE, "id": 4, "course_name": "실패과목", "credits": 5, "grade": "F"}]
    result = calculate_graduation(rows, RULE)
    assert result["earned_total"] == 8
    assert result["remaining_total"] == 112
    assert [area["earned"] for area in result["areas"]] == [5, 3]
    assert result["requirements"][0]["done"] is True
    assert all(item["done"] is None for item in result["requirements"][1:])


def test_missing_course_and_no_negative_remaining():
    result = calculate_graduation([{**GRADE, "course_name": "기타과목", "credits": 125}], RULE)
    assert result["remaining_total"] == 0
    assert result["requirements"][0]["done"] is False
    assert result["requirements"][-1]["done"] is None


def test_duplicate_passed_course_requires_review():
    result = calculate_graduation([GRADE, {**GRADE, "id": 2, "term": "3-2", "course_name": "운영 체제"}], RULE)
    assert result["earned_total"] is None
    assert result["remaining_total"] is None
    assert all(area["earned"] is None for area in result["areas"])
    assert "중복" in result["requirements"][-1]["name"]


def test_failed_then_passed_does_not_double_count():
    result = calculate_graduation([{**GRADE, "grade": "F"}, {**GRADE, "id": 2, "term": "3-2"}], RULE)
    assert result["earned_total"] == 3
    assert result["requirements"][0]["done"] is True


def test_empty_grades_are_not_graduated():
    result = calculate_graduation([], RULE)
    assert result["earned_total"] == 0
    assert result["remaining_total"] == 120
    assert result["requirements"][0]["done"] is False


def client_for(profile=PROFILE, rule=RULE, initial=None, unavailable=False):
    rows = deepcopy(initial if initial is not None else [GRADE])
    def handler(request):
        assert request.headers["authorization"] == "Bearer student-token"
        path = request.url.path
        if path == "/auth/v1/user":
            return httpx.Response(200, json={"id": USER_ID, "email": "student@skuniv.ac.kr", "email_confirmed_at": "2026-10-27T00:00:00Z"})
        if path == "/rest/v1/profiles":
            assert request.url.params["user_id"] == f"eq.{USER_ID}"
            return httpx.Response(200, json=[profile] if profile is not None else [])
        if path == "/rest/v1/grad_requirements":
            if unavailable:
                return httpx.Response(503)
            assert request.url.params["department"] == "eq." + profile["department"]
            assert request.url.params["admission_year"] == "eq." + str(profile["admission_year"])
            return httpx.Response(200, json=[rule] if rule is not None else [])
        assert path == "/rest/v1/grades"
        if request.method == "GET":
            assert request.url.params["user_id"] == f"eq.{USER_ID}"
            return httpx.Response(200, json=rows[int(request.url.params["offset"]):])
        if request.method == "POST":
            row = {"id": len(rows) + 1, **json.loads(request.content)}
            rows.append(row)
        elif request.method == "DELETE":
            row = rows.pop(0)
        else:
            row = {**rows[0], **json.loads(request.content)}
            rows[0] = row
        return httpx.Response(200, json=[row])
    return TestClient(create_app(Settings("https://example.supabase.co", "test-key"), httpx.MockTransport(handler)))


def test_graduation_endpoint():
    with client_for() as client:
        result = client.get("/graduation", headers=HEADERS)
        assert result.status_code == 200
        assert result.json()["remaining_total"] == 117
        assert result.json()["requirements"][-1]["done"] is None


@pytest.mark.parametrize("profile,rule,status,code", [
    (None, RULE, 404, "PROFILE_NOT_FOUND"),
    ({**PROFILE, "department": None}, RULE, 400, "PROFILE_INCOMPLETE"),
    ({**PROFILE, "admission_year": 2025}, None, 404, "GRADUATION_RULES_NOT_FOUND"),
])
def test_unknown_rules_are_not_guessed(profile, rule, status, code):
    with client_for(profile=profile, rule=rule) as client:
        result = client.get("/graduation", headers=HEADERS)
        assert result.status_code == status
        assert result.json()["error"]["code"] == code


def test_minor_keeps_known_major_progress_with_explicit_review_requirement():
    with client_for(profile={**PROFILE,'minor':'경영학과'}) as client:
        response = client.get('/graduation',headers=HEADERS)
        assert response.status_code == 200
        result = response.json()
        assert result['earned_total'] == 3
        assert result['requirements'][-1]['done'] is None
        assert '주전공 최소 기준' in result['requirements'][-1]['name']


def test_electronic_computer_department_uses_its_own_rule_query():
    with client_for(profile={**PROFILE,'department':'전자컴퓨터공학과','admission_year':2024}) as client:
        response = client.get('/graduation',headers=HEADERS)
        assert response.status_code == 200
        assert response.json()['required_total'] == RULE['total_credits']


def test_grade_mutations_recalculate_each_time():
    with client_for(initial=[]) as client:
        payload = {key: value for key, value in GRADE.items() if key != "id"}
        response = client.post("/grades", headers=HEADERS, json=payload)
        assert response.json()["recalculated"]["remaining_total"] == 117
        response = client.put("/grades/1", headers=HEADERS, json={**payload, "grade": "F"})
        assert response.json()["recalculated"]["remaining_total"] == 120
        response = client.delete("/grades/1", headers=HEADERS)
        assert response.json()["recalculated"]["remaining_total"] == 120


def test_recalculation_outage_does_not_report_saved_grade_as_failed():
    with client_for(initial=[], unavailable=True) as client:
        payload = {key: value for key, value in GRADE.items() if key != "id"}
        response = client.post("/grades", headers=HEADERS, json=payload)
        assert response.status_code == 200
        assert response.json()["recalculated"]["remaining_total"] is None
        assert len(client.get("/grades", headers=HEADERS).json()[0]["items"]) == 1
