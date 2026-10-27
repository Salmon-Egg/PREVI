import json
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from server.config import Settings
from server.logic.timetable import ClassTime, overlaps
from server.main import create_app
from server.routes.timetable import TimetableInput

USER_ID = str(uuid4())
HEADERS = {"Authorization": "Bearer user-token"}
SLOT = {"day": "화", "start": "10:30", "end": "12:00"}
DATA = {"course_name": "자료구조", "credits": 3, "times": [SLOT]}
ROW = {"id": 1, **DATA}


def client_for(db, profile=True):
    def handler(request):
        assert request.headers["authorization"] == "Bearer user-token"
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": USER_ID, "email": "student@skuniv.ac.kr", "email_confirmed_at": "2026-10-27T00:00:00Z"})
        if request.url.path == "/rest/v1/profiles":
            assert request.url.params["user_id"] == f"eq.{USER_ID}"
            return httpx.Response(200, json=[{"grade": 2, "semester": 1}] if profile else [])
        return db(request)
    return TestClient(create_app(Settings("https://example.supabase.co", "test-key"), httpx.MockTransport(handler)))


def test_overlap_and_adjacent_slots():
    a = ClassTime(**SLOT)
    assert overlaps(a, ClassTime(day="화", start="11:00", end="13:00"))
    assert not overlaps(a, ClassTime(day="화", start="12:00", end="13:00"))
    assert not overlaps(a, ClassTime(day="수", start="10:30", end="12:00"))


@pytest.mark.parametrize("times", [[], [{**SLOT, "end": "10:30"}], [{**SLOT, "start": "25:00"}], [{**SLOT, "day": "월요일"}], [SLOT, {**SLOT, "start": "11:00"}]])
def test_bad_times_rejected(times):
    with pytest.raises(ValidationError):
        TimetableInput(**{**DATA, "times": times})


@pytest.mark.parametrize("payload", [{"course_id": 1, **DATA}, {"course_name": "과목"}, {"course_id": 0}, {**DATA, "credits": 0}, {**DATA, "user_id": USER_ID}, {**DATA, "term": "4-2"}])
def test_invalid_payload_never_writes(payload):
    def db(request):
        pytest.fail("잘못된 입력은 DB 요청을 하면 안 됨")
    with client_for(db) as client:
        assert client.post("/timetable", headers=HEADERS, json=payload).status_code == 400


def test_list_filters_owner_and_current_term():
    def db(request):
        assert request.url.params["user_id"] == f"eq.{USER_ID}"
        assert request.url.params["term"] == "eq.2-1"
        return httpx.Response(200, json=[ROW])
    with client_for(db) as client:
        assert client.get("/timetable", headers=HEADERS).json() == [ROW]


def test_manual_registration_sets_owner_and_term():
    def db(request):
        assert request.method == "POST"
        assert json.loads(request.content) == {**DATA, "user_id": USER_ID, "term": "2-1"}
        return httpx.Response(201, json=[ROW])
    with client_for(db) as client:
        assert client.post("/timetable", headers=HEADERS, json=DATA).json() == ROW


def test_course_registration_uses_database_course():
    def db(request):
        if request.url.path == "/rest/v1/courses":
            assert request.url.params["id"] == "eq.9"
            return httpx.Response(200, json=[{"id": 9, "name": "자료구조", "credits": 3, "times": [SLOT]}])
        assert json.loads(request.content) == {**DATA, "course_id": 9, "user_id": USER_ID, "term": "2-1"}
        return httpx.Response(201, json=[ROW])
    with client_for(db) as client:
        assert client.post("/timetable", headers=HEADERS, json={"course_id": 9}).json() == ROW


@pytest.mark.parametrize("rows,expected", [([],404), ([{"name":"과목","credits":3,"times":[]}],400)])
def test_missing_or_unscheduled_course(rows, expected):
    with client_for(lambda request: httpx.Response(200, json=rows)) as client:
        assert client.post("/timetable", headers=HEADERS, json={"course_id": 9}).status_code == expected


@pytest.mark.parametrize("code,status", [("TIME_CONFLICT",409), ("CREDIT_LIMIT",409), ("DUPLICATE_COURSE",409), ("CREDIT_RULES_UNKNOWN",409), ("INVALID_TIMES",400)])
def test_db_rule_errors_preserve_api_contract(code, status):
    with client_for(lambda request: httpx.Response(400, json={"message": code, "details": "private data"})) as client:
        response = client.post("/timetable", headers=HEADERS, json=DATA)
        assert response.status_code == status
        assert response.json()["error"]["code"] == code
        assert "private" not in response.text


def test_delete_filters_owner_and_reports_missing():
    def db(request):
        assert request.method == "DELETE"
        assert request.url.params["user_id"] == f"eq.{USER_ID}"
        assert request.url.params["id"] == "eq.1"
        return httpx.Response(200, json=[])
    with client_for(db) as client:
        assert client.delete("/timetable/1", headers=HEADERS).status_code == 404


def test_profile_required():
    with client_for(lambda request: httpx.Response(500), profile=False) as client:
        assert client.get("/timetable", headers=HEADERS).status_code == 400
