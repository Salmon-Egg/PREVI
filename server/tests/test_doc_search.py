"""문서 검색 G8: 조 제목을 임베딩 입력에 붙이고, 질문에 조 제목이 있으면 그 문단을 위로."""
import asyncio

import pytest

from server.ai import client as ai_client
from server.ai import tasks
from server.routes import chat

MINOR = "[학칙] 제 23 조(부전공) ① 부전공을 하려는 학생은"
TRANSFER = "[학칙] 제 22 조의 2 (전과) ① 전과는 2학년 진학 시"
CREDIT = "[학칙] 제 30 조(학점) 학점은 15시간을 1학점으로"
CATALOG = "[졸업요건 정리(2026) · 소프트웨어학과] 졸업 총 학점 120학점"


def test_article_title_and_doc_text():
    assert ai_client.article_title(TRANSFER) == "전과"
    assert ai_client.article_title(CATALOG) == ""
    assert ai_client.doc_text("2026 서경대학교 대학요람 · 학칙", MINOR) == f"title: 2026 서경대학교 대학요람 · 학칙 · 부전공 | text: {MINOR}"
    assert ai_client.doc_text("졸업요건", CATALOG) == f"title: 졸업요건 | text: {CATALOG}"


def _search(monkeypatch, question, contents):
    async def rows(_request, _method, path, **__):
        if path == "doc_chunks":
            return []
        return [{"content": c, "title": "t", "url": None, "distance": 0.3 + i / 100} for i, c in enumerate(contents)]
    monkeypatch.setattr(ai_client, "embed", lambda texts: [[0.0]])
    monkeypatch.setattr(ai_client, "DOC_MAX_DISTANCE", 0.62)
    monkeypatch.setattr(chat, "database_rows", rows)
    return [r["content"] for r in asyncio.run(chat.search_chunks(None, question))]


def test_named_article_goes_first(monkeypatch):
    assert _search(monkeypatch, "전과 조건 알려줘", [MINOR, CREDIT, CATALOG, TRANSFER]) == [TRANSFER, MINOR, CREDIT]


def test_named_article_survives_distance_limit(monkeypatch):
    monkeypatch.setattr(ai_client, "DOC_MAX_DISTANCE", 0.62)
    rows = [{"content": MINOR, "distance": 0.70}, {"content": TRANSFER, "distance": 0.72}, {"content": CATALOG, "distance": 0.5}]
    assert [r["content"] for r in chat.rank_chunks(rows, "전과")] == [TRANSFER, CATALOG]
    assert chat.rank_chunks(rows[:1], "학식 메뉴") == []


def test_only_one_named_article_moves_up(monkeypatch):
    # "졸업의 취소"는 '취소'가 질문에 없어 안 올라감. "학점" 조 하나만 1위로, 원래 1위(졸업 자료)는 2위로 남음
    cancel = "[학칙] 제 57 조(졸업의 취소) 부정한 방법으로"
    assert _search(monkeypatch, "졸업 총 학점은 몇 학점이야?", [CATALOG, cancel, CREDIT, TRANSFER]) == [CREDIT, CATALOG, cancel]
    assert _search(monkeypatch, "학식 메뉴 알려줘", [MINOR, CREDIT, CATALOG, TRANSFER]) == [MINOR, CREDIT, CATALOG]


def test_article_outside_vector_candidates_found_by_title(monkeypatch):
    calls = []
    async def rows(_request, _method, path, **kw):
        if path == "doc_chunks":
            calls.append(kw["params"]["or"])
            return [{"content": TRANSFER, "document": {"title": "학칙", "url": None}}]
        return [{"content": MINOR, "title": "t", "url": None, "distance": 0.70}]  # 벡터 후보는 기준 밖 무관 문단뿐
    monkeypatch.setattr(ai_client, "embed", lambda texts: [[0.0]])
    monkeypatch.setattr(ai_client, "DOC_MAX_DISTANCE", 0.62)
    monkeypatch.setattr(chat, "database_rows", rows)
    assert [r["content"] for r in asyncio.run(chat.search_chunks(None, "전과 조건 알려줘"))] == [TRANSFER]
    assert 'content.like."[*조*(전과*"' in calls[0]
    assert asyncio.run(chat._titled_chunks(None, "hi")) == []


def _names(p, question):
    docs = ["소프트웨어학과", "파이낸스앤테크전공", "2017~2024학번 공통", "2025학번 이후 미래융합·자유전공"]
    rows = [{"content": f"[졸업요건 정리(2026) · {d}] 내용"} for d in docs] + [{"content": CREDIT}]
    return [r["content"] for r in chat._for_student(rows, p, question)]


def test_other_department_requirements_dropped():
    p = {"department": "소프트웨어학과", "admission_year": 2023}
    assert _names(p, "졸업 시험 있어?") == [
        "[졸업요건 정리(2026) · 소프트웨어학과] 내용", "[졸업요건 정리(2026) · 2017~2024학번 공통] 내용", CREDIT]
    assert "[졸업요건 정리(2026) · 파이낸스앤테크전공] 내용" in _names(p, "파이낸스앤테크전공 졸업 시험 있어?")
    assert "[졸업요건 정리(2026) · 2017~2024학번 공통] 내용" not in _names({**p, "admission_year": 2025}, "졸업 시험 있어?")


@pytest.mark.parametrize("question, intent", [
    ("졸업 요건이 뭐야?", "my_info"), ("졸업요건 알려줘", "my_info"), ("졸업 총 학점은 몇 학점이야?", "my_info"),
    ("파이낸스앤테크전공 졸업 요건이 뭐야?", "document"), ("졸업 요건 폐지 언제야?", "document"),
])
def test_unnamed_graduation_requirements_use_own_result(question, intent):
    assert tasks.route_question(question)["intent"] == intent
