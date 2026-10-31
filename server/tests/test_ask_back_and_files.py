"""챗봇 되묻기·저장 확인, 공지 첨부 읽기, 성적증명서 미리보기."""
import base64

import httpx
from fastapi.testclient import TestClient

from server.config import Settings
from server.jobs import attachments
from server.logic.eligibility import judge
from server.logic.profile_chat import ASKS, asked_field, describe, profile_updates
from server.logic.transcript import clean_courses
from server.main import create_app
from server.routes import grades as grades_route
from test_chat import CHUNK, run_chat

STUDENT = {"grade": 3, "department": "소프트웨어학과", "status": "enrolled"}


def test_statements_become_updates():
    assert profile_updates("나 토익 800점이야") == {"toeic_score": 800}
    assert profile_updates("소득 3구간이에요") == {"income_bracket": 3}
    assert profile_updates("저 안산시에 살아요") == {"residence": "안산시"}
    assert profile_updates("나 휴학했어") == {"status": "leave"}
    assert profile_updates("3학년 2학기야") == {"grade": 3, "semester": 2}
    assert profile_updates("23학번이에요") == {"admission_year": 2023}


def test_questions_are_not_updates():
    for text in ("토익 800점이면 신청 돼?", "휴학하면 장학금은 어떻게 돼?", "3학년 장학금 뭐야", "복학 신청은 언제 해?", "졸업까지 몇 학점 남았어?", "성적우수 장학금 조건"):
        assert profile_updates(text) == {}, text


def test_bare_answer_only_counts_right_after_asking():
    asked = asked_field("장학금이 2개 있어요.\n\n" + ASKS["toeic_score"])
    assert asked == "toeic_score" and profile_updates("800", asked) == {"toeic_score": 800}
    assert profile_updates("800") == {}
    assert profile_updates("2000", "toeic_score") == {}
    assert profile_updates("3구간", "income_bracket") == {"income_bracket": 3}
    assert profile_updates("안산시요", "residence") == {"residence": "안산시"}
    assert asked_field("그냥 답") is None
    assert describe({"toeic_score": 800, "status": "leave"}) == "토익 800점, 학적 휴학"


def test_chat_asks_for_confirmation_instead_of_saving(monkeypatch):
    res, saved = run_chat(monkeypatch, "나 토익 800점이야", [CHUNK])
    msg = res.json()["message"]
    assert "토익 800점" in msg["text"] and msg["actions"] == [{"type": "save_profile", "label": "저장하기", "payload": {"toeic_score": 800}}]
    assert not any(t == "profiles" for _, t, _ in saved)


def test_judge_uses_values_the_student_gave():
    income = {"income_max": 8}
    assert judge({}, income, STUDENT, None, 0)[0] == "check"
    assert judge({}, income, {**STUDENT, "income_bracket": 3}, None, 0)[0] == "eligible"
    assert judge({}, income, {**STUDENT, "income_bracket": 9}, None, 0)[0] == "ineligible"
    toeic = {"unknown": ["토익 700점 이상"]}
    assert judge({}, toeic, STUDENT, None, 0)[0] == "check"
    assert judge({}, toeic, {**STUDENT, "toeic_score": 800}, None, 0)[0] == "eligible"
    assert judge({}, toeic, {**STUDENT, "toeic_score": 600}, None, 0)[0] == "ineligible"
    assert judge({}, {"unknown": ["토익 700점 또는 토플 80점"]}, {**STUDENT, "toeic_score": 600}, None, 0)[0] == "check"


def test_judge_residence_fails_only_when_clearly_elsewhere():
    me = {**STUDENT, "residence": "서울시 성북구"}
    assert judge({}, {"unknown": ["안산시 1년 이상 거주"]}, me, None, 0)[0] == "ineligible"
    assert judge({}, {"unknown": ["성북구 1년 이상 거주"]}, me, None, 0)[0] == "check"
    assert judge({}, {"unknown": ["부모가 안산시 거주"]}, me, None, 0)[0] == "check"
    assert judge({}, {"unknown": ["안산시 1년 이상 거주"]}, STUDENT, None, 0)[0] == "check"


def test_only_known_attachment_kinds_are_read(monkeypatch):
    files = [{"file_key": "2026/10/a.jpg"}, {"file_key": "2026/10/b.pdf"}, {"file_key": "2026/10/c.zip"},
             {"file_key": "../../etc/passwd"}, {"file_key": None}, {"name": "본문", "kind": "inline_image"}]
    assert [a["file_key"] for a in attachments.readable(files)] == ["2026/10/a.jpg", "2026/10/b.pdf"]
    asked = []
    monkeypatch.setattr(attachments, "fetch_school", lambda client, url: asked.append(url) or b"x")
    monkeypatch.setattr(attachments.ai_client, "read_image", lambda data, mime: "지원자격  토익" + chr(0) + "700")
    monkeypatch.setattr(attachments, "PdfReader", lambda f: (_ for _ in ()).throw(ValueError("깨진 PDF")))
    assert attachments.attachment_text(files) == "지원자격 토익 700"  # 깨진 PDF는 건너뛰고, 저장을 막는 널 문자는 지움
    assert asked == ["https://www.skuniv.ac.kr/wp-content/uploads/2026/10/b.pdf", "https://www.skuniv.ac.kr/wp-content/uploads/2026/10/a.jpg"]


def test_poster_is_skipped_when_document_already_has_the_text(monkeypatch):
    monkeypatch.setattr(attachments, "fetch_school", lambda client, url: b"x")
    monkeypatch.setattr(attachments, "read_text", lambda data: "가" * 400)
    monkeypatch.setattr(attachments.ai_client, "read_image", lambda data, mime: (_ for _ in ()).throw(AssertionError("사진까지 읽음")))
    assert attachments.attachment_text([{"file_key": "2026/10/a.png"}, {"file_key": "2026/10/b.hwp"}]) == "가" * 400


def test_transcript_rows_are_checked():
    rows = [{"year": 2023, "semester": 1, "name": "자료구조", "credits": 3, "grade": "A+", "area": "전필"},
            {"year": 2023, "semester": 1, "name": "자료구조", "credits": 3, "grade": "A+", "area": "전필"},
            {"year": 2024, "semester": 2, "name": "심리학", "credits": "2", "grade": "A", "area": None},
            {"year": 2024, "semester": "계절", "name": "계절과목", "credits": 3, "grade": "A0"},
            {"year": 2019, "semester": 1, "name": "입학 전", "credits": 3, "grade": "A0"},
            {"year": 2024, "semester": 1, "name": "이상한 성적", "credits": 3, "grade": "Z"}, {"name": "칸 없음"}]
    items, dropped = clean_courses(rows, 2023)
    assert items == [{"term": "1-1", "course_name": "자료구조", "credits": 3.0, "grade": "A+", "area": "전공 필수"},
                     {"term": "2-2", "course_name": "심리학", "credits": 2.0, "grade": "A0", "area": "교양 선택"}]
    assert dropped == 4


def client_for(rows):
    def handler(request):
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": "00000000-0000-0000-0000-000000000001", "email": "s@skuniv.ac.kr", "email_confirmed_at": "2026-10-27T00:00:00Z"})
        return httpx.Response(200, json=rows)
    return TestClient(create_app(Settings("https://example.supabase.co", "k"), httpx.MockTransport(handler)))


HEADERS = {"Authorization": "Bearer t"}
PNG = base64.b64encode(b"\x89PNG\r\n\x1a\nxx").decode()


def test_transcript_upload_previews_without_saving(monkeypatch):
    monkeypatch.setattr(grades_route.ai_client, "read_image", lambda data, mime: "2024 1학기 자료구조 3 A+")
    monkeypatch.setattr(grades_route.tasks, "read_transcript", lambda text: [{"year": 2024, "semester": 1, "name": "자료구조", "credits": 3, "grade": "A+", "area": "전필"}])
    with client_for([{"admission_year": 2024}]) as client:
        res = client.post("/grades/from-file", headers=HEADERS, json={"content_base64": PNG})
    assert res.status_code == 200 and res.json()["items"][0]["term"] == "1-1"


def test_transcript_upload_errors(monkeypatch):
    monkeypatch.setattr(grades_route.ai_client, "read_image", lambda data, mime: "")
    monkeypatch.setattr(grades_route.tasks, "read_transcript", lambda text: [])
    with client_for([{"admission_year": 2024}]) as client:
        assert client.post("/grades/from-file", headers=HEADERS, json={"content_base64": PNG}).json()["error"]["code"] == "TRANSCRIPT_EMPTY"
        not_image = base64.b64encode(b"hello").decode()
        assert client.post("/grades/from-file", headers=HEADERS, json={"content_base64": not_image}).status_code == 400
    with client_for([{"admission_year": None}]) as client:
        assert client.post("/grades/from-file", headers=HEADERS, json={"content_base64": PNG}).json()["error"]["code"] == "PROFILE_INCOMPLETE"
