from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from server.config import Settings
from server.main import create_app
from server.routes.calendar import next_calendar_event
from server.routes.home import scholarship_status

USER_ID = str(uuid4())
HEADERS = {"Authorization": "Bearer user-token"}
KST = timezone(timedelta(hours=9))
NOW = datetime(2026, 10, 27, 12, tzinfo=KST)
EVENT = {"id": 1, "title": "수강 정정", "start_date": "2026-10-28", "end_date": "2026-10-30", "target_grades": []}
SCHOLAR = {"notice_id": 7, "title": "가상 장학", "deadline": "2026-10-27T18:00:00+09:00", "verdict": "eligible", "reasons": [], "applied": False}


def test_calendar_current_event_and_future():
    result = next_calendar_event([EVENT], date(2026, 10, 27))
    assert result["d_day"] == 1
    assert next_calendar_event([EVENT], date(2026, 10, 29))["d_day"] == 0
    assert next_calendar_event([EVENT], date(2026, 10, 31)) is None
    assert next_calendar_event([], date(2026, 10, 27)) is None


def test_current_event_is_not_hidden_by_later_event():
    later = {**EVENT, "id": 2, "start_date": "2026-11-01", "end_date": "2026-11-01"}
    assert next_calendar_event([later, EVENT], date(2026, 10, 29))["id"] == 1


def test_scholarship_status_today_pending_applied_and_expired():
    assert scholarship_status([SCHOLAR], NOW) == "신청 가능 1건 · 오늘 마감"
    assert scholarship_status([{**SCHOLAR, "applied": True}], NOW) == "신청 가능 판정 없음"
    assert scholarship_status([{**SCHOLAR, "deadline": "2026-10-26T18:00:00+09:00"}], NOW) == "신청 가능 판정 없음"
    assert scholarship_status([{**SCHOLAR, "verdict": "check"}], NOW) == "장학 조건 확인 필요"
    assert scholarship_status([], NOW) == "장학 자격 판정 대기"


def test_deadline_timezone_is_korean_date():
    assert scholarship_status([{**SCHOLAR, "deadline": "2026-10-27T14:30:00Z"}], NOW) == "신청 가능 1건 · 오늘 마감"


def client_for(grade=2, records=None, db_failure=False, with_data=False):
    def handler(request):
        assert request.headers["authorization"] == "Bearer user-token"
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": USER_ID, "email": "student@skuniv.ac.kr", "email_confirmed_at": "2026-10-27T00:00:00Z"})
        table = request.url.path.rsplit("/", 1)[-1]
        if table == "profiles":
            assert request.url.params["user_id"] == "eq." + USER_ID
            return httpx.Response(200, json=[{"grade": grade, "department": "소프트웨어학과", "admission_year": 2023, "minor": None}])
        if table == "grad_requirements":
            if db_failure: return httpx.Response(503)
            return httpx.Response(200, json=[{"total_credits":120,"areas":[],"required_courses":[],"certifications":[]}])
        if table == "grades": return httpx.Response(200, json=[])
        if table == "academic_calendar":
            if request.url.params["offset"] != "0": return httpx.Response(200, json=[])
            return httpx.Response(200, json=records if records is not None else [])
        if table == "todos":
            assert request.url.params["user_id"] == "eq." + USER_ID
            assert request.url.params["done"] == "eq.false"
            return httpx.Response(200, json=[{"id":1,"type":"deadline","title":"할 일","due_date":None,"done":False}] if with_data else [])
        if table == "eligibility":
            assert request.url.params["user_id"] == "eq." + USER_ID
            if request.url.params["select"] == "id": return httpx.Response(200, json=[{"id":1}] if with_data else [])
            assert request.url.params["notice.category"] == "eq.장학"
            if request.url.params["offset"] != "0": return httpx.Response(200, json=[])
            return httpx.Response(200, json=[{"verdict":"eligible","reasons":["조건 확인"],"notice":{"id":7,"title":"장학","deadline":None,"url":None}}] if with_data else [])
        if table == "scholarship_applications":
            assert request.url.params["user_id"] == "eq." + USER_ID
            return httpx.Response(200, json=[])
        pytest.fail("Unexpected table: " + table)
    return TestClient(create_app(Settings("https://example.supabase.co", "test-key"), httpx.MockTransport(handler)))


def test_calendar_grade_filter():
    events = [EVENT, {**EVENT, "id":2,"target_grades":[4]}, {**EVENT,"id":3,"target_grades":[2]}]
    with client_for(records=events) as client:
        assert [row["id"] for row in client.get("/calendar", headers=HEADERS).json()] == [1,3]
    with client_for(grade=None, records=events) as client:
        assert [row["id"] for row in client.get("/calendar", headers=HEADERS).json()] == [1]


def test_home_schema_and_empty_data():
    with client_for() as client:
        response = client.get("/home", headers=HEADERS)
        assert response.status_code == 200
        body = response.json()
        assert set(body) == {"briefing","today_todos","next_event","menu_status","suggested_questions"}
        assert body["today_todos"] == [] and body["next_event"] is None
        assert "120" in body["menu_status"]["study"]
        assert "세부요건 확인" in body["menu_status"]["study"]
        assert "대기" in body["menu_status"]["scholarship"]
        assert len(body["suggested_questions"]) == 3


def test_home_combines_todos_scholarships_and_notices():
    with client_for(with_data=True) as client:
        body = client.get("/home", headers=HEADERS).json()
        assert body["today_todos"][0]["title"] == "할 일"
        assert "done" not in body["today_todos"][0]
        assert body["menu_status"]["scholarship"] == "신청 가능 1건"
        assert body["menu_status"]["admin"] == "맞춤 공지 1건"
        assert "할 일" in body["briefing"]
        scholarship = client.get("/scholarships", headers=HEADERS).json()[0]
        assert scholarship["notice_id"] == 7 and scholarship["applied"] is False


def test_home_does_not_hide_database_failure_as_empty_data():
    with client_for(db_failure=True) as client:
        assert client.get("/home", headers=HEADERS).status_code == 500


def test_home_calendar_require_login_and_year_is_validated():
    with client_for() as client:
        for path in ("/home","/calendar","/scholarships"):
            assert client.get(path).status_code == 401
        assert client.get("/calendar?year=9999", headers=HEADERS).status_code == 400
