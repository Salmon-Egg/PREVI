from types import SimpleNamespace

import pytest

from server.ai import tasks
from server.logic.transcript import assign_terms, clean_courses, credit_check, parse_courses, unmatched_course_lines
from server.routes import grades
from server.tests.test_ask_back_and_files import client_for, HEADERS, PNG


def row(**changes):
    return {"year": 2021, "semester": 1, "name": "전자컴퓨터공학개론", "credits": 3,
            "grade": "D+", "area": "전필", **changes}


def test_old_catalog_courses_do_not_require_current_course_database():
    items, dropped = clean_courses([row(), row(name="Global English1"), row(name="Global English2", semester=2)], 2021)
    assert [i["course_name"] for i in items] == ["전자컴퓨터공학개론", "Global English1", "Global English2"]
    assert dropped == 0


def test_leave_years_never_become_sixth_grade_and_missing_values_stay_visible():
    items, dropped = clean_courses([row(year=2026), row(name="확인할 과목", grade=None, year=None)], 2021)
    assert all(i["term"] is None for i in items)
    assert items[0]["source_year"] == 2026 and items[1]["grade"] is None
    assert len(items) == 2 and dropped == 0


@pytest.mark.parametrize('area, expected', [('전심', '전공 심화'), ('전핵', '전공 핵심'),
    ('전기', '전공 기초'), ('전선', '전공 선택'), ('자선', '자유 선택'), ('일선', '일반 선택'), (None, '')])
def test_areas_are_not_changed_into_unrelated_categories(area, expected):
    items, _ = clean_courses([row(area=area)])
    assert items[0]['area'] == expected


def test_source_na_is_not_reconstructed_as_a_passed_grade():
    source = '2021학년도 1학기\n전필 Global English1 3 N/A'
    items, _ = clean_courses([row(name='Global English1', grade='C+')], source_text=source)
    assert items[0]['excluded'] and items[0]['grade'] is None
    assert items[0]['raw_grade'] == 'N/A'


def test_source_d_plus_overrides_hallucinated_c_plus():
    source = '전필 전자컴퓨터공학개론 3 D+'
    items, _ = clean_courses([row(grade='C+')], source_text=source)
    assert items[0]['grade'] == 'D+' and items[0]['area'] == '전공 필수'
    assert items[0]['issues']


def test_two_columns_with_different_grades_require_review():
    source = '전필 Global English1 3 N/A       교선 Global English2 3 C+'
    items, _ = clean_courses([row(name='Global English1', grade='C+')], source_text=source)
    assert items[0]['grade'] is None and items[0]['area'] == ''


def test_unreadable_area_and_credit_are_not_guessed():
    items, _ = clean_courses([row(credits=2, area='교선')], source_text='전자컴퓨터공학개론 3 D+')
    assert items[0]['credits'] is None and items[0]['area'] == ''


def test_explicit_retake_exclusion_and_invalid_grade_do_not_drop_course_names():
    items, dropped = clean_courses([row(grade='N/A'), row(name='새 과목', grade='Z')])
    assert len(items) == 2 and dropped == 0
    assert items[0]['excluded'] and not items[1]['excluded'] and items[1]['grade'] is None


def test_conflicting_duplicates_are_not_silently_overwritten():
    items, _ = clean_courses([row(grade='D+'), row(grade='C+')])
    assert len(items) == 2


def test_chunk_preserves_semester_header_and_never_splits_course_line(monkeypatch):
    calls = []
    def ask(prompt, payload, **kwargs):
        assert kwargs['strict']
        calls.append(payload)
        return {'courses': []}
    monkeypatch.setattr(tasks, '_ask', ask)
    line = '전필 전자컴퓨터공학개론 3 D+'
    tasks.read_transcript('2021학년도 1학기\n' + (line + '\n') * 150)
    assert len(calls) > 1
    assert calls[1]['previous_semester_headers'] == ['2021학년도 1학기']
    assert all(line in c['text'] for c in calls)


def test_separate_year_and_semester_headers_survive_chunk_boundary(monkeypatch):
    calls = []
    monkeypatch.setattr(tasks, '_ask', lambda _, payload, **kwargs: calls.append(payload) or {'courses': []})
    tasks.read_transcript('2021학년도\n1학기\n' + '전필 Global English1 3 D+\n' * 100)
    assert '2021학년도' in calls[1]['previous_semester_headers']
    assert '1학기' in calls[1]['previous_semester_headers']


def test_supplementary_course_suffix_does_not_match_another_course():
    items, _ = clean_courses([row(name='Global English1')], source_text='교필 Global English10 3 A+')
    assert items[0]['grade'] is None


def test_original_full_major_area_is_not_shortened_to_major():
    items, _ = clean_courses([row(area='전선')], source_text='전공 심화 전자컴퓨터공학개론 3 D+')
    assert items[0]['area'] == '전공 심화'


def test_potentially_missing_course_lines_are_visible_for_review():
    text = '교필 Global English1 3 D+\n교필 Global English2 3 A+\n총 평점 4.0'
    items, _ = clean_courses([row(name='Global English2')])
    assert unmatched_course_lines(text, items) == ['교필 Global English1 3 D+']


def test_failed_chunk_does_not_return_silent_partial_import(monkeypatch):
    calls = []
    def ask(*args, **kwargs):
        calls.append(1)
        return {'courses': [row()]} if len(calls) == 1 else None
    monkeypatch.setattr(tasks, '_ask', ask)
    with pytest.raises(ValueError):
        tasks.read_transcript('2021학년도 1학기\n' + '과목 줄\n' * 400)


def test_pdf_extracts_layout_not_flattened_table(monkeypatch):
    def extract(**kwargs):
        assert kwargs == {'extraction_mode': 'layout', 'layout_mode_space_vertically': False}
        return '전필    Global English1    3    D+'
    monkeypatch.setattr(grades, 'PdfReader', lambda _: SimpleNamespace(pages=[SimpleNamespace(extract_text=extract)]))
    assert '    ' in grades._transcript_text(b'%PDF fake')


def test_old_app_cannot_silently_save_estimated_terms():
    with client_for([]) as client:
        response = client.post('/grades/from-file', headers=HEADERS, json={'content_base64': PNG})
    assert response.status_code == 409
    assert response.json()['error']['code'] == 'TRANSCRIPT_PREVIEW_UPDATE_REQUIRED'


def test_api_parse_failure_does_not_disclose_source_and_writes_nothing(monkeypatch, caplog):
    from fastapi.testclient import TestClient
    import httpx
    from server.main import create_app
    from server.config import Settings
    calls = []
    def transport(request):
        calls.append((request.method, request.url.path))
        assert request.method == 'GET' and request.url.path == '/auth/v1/user'
        return httpx.Response(200, json={'id': '00000000-0000-0000-0000-000000000001', 'email': 's@skuniv.ac.kr', 'email_confirmed_at': '2026-10-27T00:00:00Z'})
    monkeypatch.setattr(grades, '_transcript_text', lambda _: 'private student data')
    def fail(_):
        raise ValueError('private student data')
    monkeypatch.setattr(tasks, 'read_transcript', fail)
    with TestClient(create_app(Settings('https://example.supabase.co', 'k'), httpx.MockTransport(transport))) as client:
        response = client.post('/grades/from-file', headers=HEADERS, json={'content_base64': PNG, 'preview_version': 2})
    assert response.status_code == 502 and response.json()['error']['code'] == 'TRANSCRIPT_PARSE_FAILED'
    assert 'private student data' not in response.text and 'private student data' not in caplog.text
    assert len(calls) == 1


# 서경대 증명서 글자 배치를 본뜬 가짜 표: 두 칸, "Bo" 표기, 학점 없는 N/A, 담당교수 없는 행, 띄어쓴 교수 이름, 재수강 ":R"
SKUNIV_LAYOUT = """\
    총계      신청학점    취득학점    평점총계    평점평균       지도교수                          홍길동
              120     14    400.0    3.00   졸업논문(시험)
                  2021년도 1학기                                         2024년도 2학기
 구분             과 목 명            담당교수     학점  성적     구분            과 목 명             담당교수    학점   성적
 전핵    논리회로                       김교수         N/A    전심   논리회로:R                    박교수     3  B+
 교필    Global English 1          디온 타이어리    2  Bo     자선   생활일본어:교류                         3  Ao
신청      취득      평점       평점                          전심   지식재산권과창업                  이교수     1  P
학점   16 학점   16 총계  48.0 평균  3.00백분위50.00석차  10/100  교선   MZ세대 법이야기                 최교수     3  F
                  2021년도 2학기
 전심    회로이론                       조교수      3  C+
"""


def test_skuniv_transcript_is_read_by_code_with_both_columns():
    items, dropped = clean_courses(parse_courses(SKUNIV_LAYOUT))
    assign_terms(items)
    rows = {(i["term"], i["course_name"]): (i["credits"], i["grade"], i["area"], i["excluded"]) for i in items}
    assert dropped == 0 and rows == {
        ("1-1", "논리회로"): (None, None, "전공 핵심", True),
        ("1-1", "Global English 1"): (2.0, "B0", "교양 필수", False),
        ("1-2", "회로이론"): (3.0, "C+", "전공 심화", False),
        ("2-1", "논리회로"): (3.0, "B+", "전공 심화", False),
        ("2-1", "생활일본어:교류"): (3.0, "A0", "자유 선택", False),
        ("2-1", "지식재산권과창업"): (1.0, "P", "전공 심화", False),
        ("2-1", "MZ세대 법이야기"): (3.0, "F", "교양 선택", False),
    }
    assert not any(i["issues"] for i in items)
    assert credit_check(SKUNIV_LAYOUT, items) == {"read": 12.0, "stated": 14.0}  # 다르면 앱이 누락 경고


def test_other_transcript_layouts_fall_back_to_ai():
    assert parse_courses("2024학년도 1학기\n전필 자료구조 3 A+") == []


def test_terms_count_semesters_taken_and_stop_at_fourth_year():
    rows = [row(year=y, semester=s, name=f"{y}-{s}") for y in range(2019, 2025) for s in (1, 2)]  # 12개 학기
    rows.append(row(name="학기 불명", year=None))
    items, _ = clean_courses(rows)
    terms = {i["course_name"]: i["term"] for i in assign_terms(items)}
    assert terms["2019-1"] == "1-1" and terms["2020-2"] == "2-2" and terms["2022-2"] == "4-2"
    assert terms["2024-2"] == "4-2" and terms["학기 불명"] is None  # 9번째부터 묶음, 모르는 학기는 학생이 고름
    leave = assign_terms(clean_courses([row(year=2021, semester=2), row(year=2026, semester=1, name="복학 후")])[0])
    assert [i["term"] for i in leave] == ["1-1", "1-2"]  # 휴학한 해를 세지 않음
