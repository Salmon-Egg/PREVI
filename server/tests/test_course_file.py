"""강의시간표 HWP → 과목. 표 모양은 2026-2학기 실제 파일에서 가져옴."""
import base64

import pytest
from test_admin import HEADERS, make

from server.logic.course_file import courses_from_tables, parse_times, read_tables
from server.routes import admin


def test_parse_times_all_shapes_in_the_school_file():
    assert parse_times("화 21.22") == [{"day": "화", "start": "09:00", "end": "11:45"}]
    assert parse_times("목 6.7.8") == [{"day": "목", "start": "14:00", "end": "16:50"}]
    assert parse_times("수2.3 금5.6") == [{"day": "수", "start": "10:00", "end": "11:50"}, {"day": "금", "start": "13:00", "end": "14:50"}]
    assert parse_times("화목 21") == [{"day": "화", "start": "09:00", "end": "10:15"}, {"day": "목", "start": "09:00", "end": "10:15"}]
    assert parse_times("화 6.7.8 9.10.11") == [{"day": "화", "start": "14:00", "end": "19:50"}]


def test_parse_times_rejects_what_is_not_a_time():
    for text in ("", "OCU 홈 페 이 지 참 조", "월 99", "월 21.1"):  # 마지막: 75분 교시와 50분 교시가 겹침
        assert parse_times(text) is None


def cell(r, c, text, rs=1):
    return {"r": r, "c": c, "cs": 1, "rs": rs, "text": text}


HEAD = ["학년", "이수 구분", "학 수 번 호", "교  과  목  명", "분반", "시 간", "학 점", "담  당 교  수", "요일ㆍ교시", "강의실", "비  고"]


def row(r, *values):
    return [cell(r, 1 + i, v) for i, v in enumerate(values)]


def test_rows_become_courses_and_same_name_time_is_one():
    table = {"rows": 7, "cells": [cell(0, i, h) for i, h in enumerate(HEAD)] + [cell(1, 0, "1.2", rs=6)]
             + row(1, "전심", "EN1003", "C++프로그래밍", "01", "3", "3", "김태영", "월 23.24", "북-520", "")
             + row(2, "전심", "EN1003", "C++프로그래밍", "02", "3", "3", "최영", "월 23.24", "북-319", "")  # 시간이 같은 분반
             + row(3, "전심", "EN1003", "C++프로그래밍", "03", "3", "3", "최영", "수 23.24", "북-319", "")  # 시간이 다른 분반
             + row(4, "전핵", "CS2000", "자료구조", "01", "3", "3", "이", "", "", "")  # 시간 없음
             + row(5, "전공", "CC1999", "졸업논문및시험", "", "", "P", "", "", "", "")  # 학점 P
             + row(6, "소계", "", "", "", "", "", "", "", "", "")}
    courses, skipped = courses_from_tables([table, {"rows": 1, "cells": [cell(0, 0, "목차")]}])
    assert [(c["name"], c["times"][0]["day"], c["area"], c["credits"]) for c in courses] == [
        ("C++프로그래밍", "월", "전공심화", 3.0), ("C++프로그래밍", "수", "전공심화", 3.0)]
    assert skipped == ["자료구조", "졸업논문및시험"]


def test_not_a_hwp_is_a_clear_error():
    with pytest.raises(ValueError):
        read_tables(b"not an ole file")


def test_import_adds_only_new_courses(monkeypatch):
    new = {"name": "새 과목", "credits": 3.0, "area": "전공심화", "times": [{"day": "월", "start": "09:00", "end": "09:50"}]}
    old = {"name": "있던 과목", "credits": 3.0, "area": "전공심화", "times": [{"day": "화", "start": "09:00", "end": "09:50"}]}
    monkeypatch.setattr(admin, "read_tables", lambda data: [])
    monkeypatch.setattr(admin, "courses_from_tables", lambda tables: ([new, old], ["시간 없는 과목"]))
    client, saved = make(rows={"courses": [{"name": old["name"], "times": [{"start": "09:00", "day": "화", "end": "09:50"}]}]})
    body = {"filename": "시간표.hwp", "content_base64": base64.b64encode(b"x").decode()}
    with client:
        res = client.post("/admin/courses/import", headers=HEADERS, json=body)
        wrong = client.post("/admin/courses/import", headers=HEADERS, json={**body, "filename": "시간표.pdf"})
    assert res.status_code == 201 and res.json() == {"added": 1, "duplicates": 1, "skipped": ["시간 없는 과목"]}
    assert wrong.status_code == 400
    assert [s[3] for s in saved if s[1] == "courses"] == [[new]]
