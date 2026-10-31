from types import SimpleNamespace

import pytest

from server.ai import tasks
from server.logic.transcript import clean_courses, unmatched_course_lines
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
