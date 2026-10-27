import json
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from server.config import Settings
from server.logic.grades import grouped_grades, semester_gpa
from server.main import create_app

USER_ID = str(uuid4())
HEADERS = {"Authorization": "Bearer student-token"}
INPUT = {"term": "2-1", "course_name": "자료구조", "credits": 3, "grade": "A+", "area": "전공"}
ROW = {"id": 7, **INPUT}


def client_for(db):
    def handler(request):
        assert request.headers["authorization"] == "Bearer student-token"
        assert request.headers["apikey"] == "test-key"
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": USER_ID, "email": "student@skuniv.ac.kr", "email_confirmed_at": "2026-10-27T00:00:00Z"})
        return db(request)
    return TestClient(create_app(Settings("https://example.supabase.co", "test-key"), httpx.MockTransport(handler)))


def test_gpa_weighting_p_and_f():
    items = [{"credits": 3, "grade": "A+"}, {"credits": 2, "grade": "B0"}, {"credits": 1, "grade": "F"}, {"credits": 10, "grade": "P"}]
    assert semester_gpa(items) == 3.25


def test_school_gpa_truncates_instead_of_rounding():
    assert semester_gpa([{"credits": 1, "grade": "A+"}, {"credits": 2, "grade": "B0"}, {"credits": 4, "grade": "C0"}]) == 2.64


def test_gpa_with_decimal_credits():
    assert semester_gpa([{"credits": 1.5, "grade": "A+"}, {"credits": 0.5, "grade": "F"}]) == 3.37


def test_p_only_has_no_gpa():
    assert semester_gpa([{"credits": 3, "grade": "P"}]) is None
    assert semester_gpa([]) is None


def test_groups_newest_semester_first():
    result = grouped_grades([ROW, {**ROW, "id": 8, "term": "3-2"}, {**ROW, "id": 9, "term": "3-1"}])
    assert [item["term"] for item in result] == ["3-2", "3-1", "2-1"]
    assert "term" not in result[0]["items"][0]


def test_list_reads_all_pages_with_owner_filter():
    calls = []
    def db(request):
        assert request.url.params["user_id"] == f"eq.{USER_ID}"
        calls.append(int(request.url.params["offset"]))
        return httpx.Response(200, json=[ROW] if request.url.params["offset"] == "0" else [])
    with client_for(db) as client:
        assert client.get("/grades", headers=HEADERS).json() == [{"term": "2-1", "gpa": 4.5, "items": [{key: value for key, value in ROW.items() if key != "term"}]}]
        assert calls == [0, 1]


def test_create_sets_user_id_server_side():
    def db(request):
        assert request.method == "POST"
        assert json.loads(request.content) == {**INPUT, "user_id": USER_ID}
        return httpx.Response(201, json=[ROW])
    with client_for(db) as client:
        response = client.post("/grades", headers=HEADERS, json=INPUT)
        assert response.status_code == 200
        assert response.json()["item"] == ROW
        # 근거 없는 졸업 학점/장학 수치는 반환하지 않는다.
        assert response.json()["recalculated"] == {"remaining_total": None, "new_eligible_scholarships": None}


@pytest.mark.parametrize("method", ["put", "delete"])
def test_mutation_filters_id_and_owner(method):
    def db(request):
        assert request.method == {"put": "PATCH", "delete": "DELETE"}[method]
        assert request.url.params["id"] == "eq.7"
        assert request.url.params["user_id"] == f"eq.{USER_ID}"
        return httpx.Response(200, json=[ROW])
    with client_for(db) as client:
        kwargs = {"json": INPUT} if method == "put" else {}
        assert getattr(client, method)("/grades/7", headers=HEADERS, **kwargs).json()["item"] == ROW


@pytest.mark.parametrize("method", ["put", "delete"])
def test_missing_or_other_user_grade_returns_404(method):
    with client_for(lambda request: httpx.Response(200, json=[])) as client:
        kwargs = {"json": INPUT} if method == "put" else {}
        assert getattr(client, method)("/grades/7", headers=HEADERS, **kwargs).status_code == 404


@pytest.mark.parametrize("change", [{"term": "2-3"}, {"credits": 0}, {"credits": -3}, {"credits": 1.55}, {"grade": "A"}, {"course_name": "  "}, {"area": ""}, {"user_id": USER_ID}])
def test_invalid_grade_never_sent_to_db(change):
    def db(request):
        pytest.fail("잘못된 성적을 DB에 보내면 안 됨")
    with client_for(db) as client:
        assert client.post("/grades", headers=HEADERS, json={**INPUT, **change}).status_code == 400


def test_duplicate_error_is_safe():
    with client_for(lambda request: httpx.Response(409, json={"detail": "private DB data"})) as client:
        response = client.post("/grades", headers=HEADERS, json=INPUT)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "DUPLICATE_GRADE"
        assert "private" not in response.text


def test_course_search_is_read_only_and_escapes_wildcards():
    def db(request):
        assert request.url.path == "/rest/v1/courses"
        assert request.method == "GET"
        assert request.url.params["name"] == "ilike.%A\\_\\%\\*%"
        return httpx.Response(200, json=[])
    with client_for(db) as client:
        assert client.get("/courses", params={"q": "A_%*"}, headers=HEADERS).json() == []
