"""챗봇 POST /chat (H-1, H-2) · 대화 목록 (H-3).
⑩ 의도 파악 → 내 정보면 ⑫ 계산 결과로 답, 문서면 ⑪ 문서 검색 후 근거로 답, 근거가 없으면 '모른다' + 기록.
AI 호출은 동기 함수라 run_in_threadpool로 돌려 서버가 멈추지 않게 함."""
import logging
import re
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from server.ai import client as ai_client
from server.ai import tasks
from server.auth import AuthenticatedUser, require_user
from server.database import database_rows
from server.errors import APIError
from server.routes.graduation import graduation_result
from server.routes.scholarships import scholarship_rows

router = APIRouter(tags=["챗봇"])
log = logging.getLogger("chat")
VERDICT_KO = {"eligible": "신청 가능", "check": "확인 필요", "ineligible": "조건 미충족"}
UNKNOWN = "학교 문서에서 근거를 찾지 못했어요. 질문을 기록해 두었으니, 문서가 보강되면 답해 드릴게요."
MSG_COLS = "id,role,text,cards,sources,actions,created_at"
CONV_COLS = "id,title,pinned,updated_at"


def _bigrams(s: str) -> set[str]:
    s = re.sub(r"[\s\W_]+", "", s)
    return {s[i:i + 2] for i in range(len(s) - 1)}


async def search_chunks(request: Request, question: str, k: int = 3) -> list[dict]:
    """문서 검색. 임베딩이 있으면 벡터 검색(match_doc_chunks), 없으면(가짜 AI 모드) 두 글자 묶음이 많이 겹치는 문단."""
    vec = await run_in_threadpool(ai_client.embed, [ai_client.QUERY_FMT.format(question)])
    if vec:
        rows = await database_rows(request, "POST", "rpc/match_doc_chunks",
                                   json={"query_embedding": str(vec[0]), "match_count": k})
        log.info("문서 거리 %s: %s", question[:30], [round(r["distance"], 3) for r in rows])  # 기준 숫자 정할 때 봄
        return [r for r in rows if r["distance"] <= ai_client.DOC_MAX_DISTANCE]
    # shortcut: 문단을 전부 받아 비교함. 문단이 수천 개가 되면 느려지니 그때는 임베딩(벡터 검색)을 켜기
    rows = await database_rows(request, "GET", "doc_chunks", params={"select": "content,document:documents(title,url)", "limit": 2000})
    q = _bigrams(question)
    scored = []
    for r in rows:
        b = _bigrams(r["content"])
        hit = len(q & b)
        if hit >= 3:
            scored.append((hit / len(b) ** 0.5, {"content": r["content"], **r["document"]}))  # 짧고 딱 맞는 문단이 위로
    return [r for _, r in sorted(scored, key=lambda x: -x[0])[:k]]


async def _calendar_action(request: Request, question: str) -> list[dict]:
    """⑬ 다음 행동 버튼 (규칙): 질문과 비슷한 학사일정이 앞으로 있으면 '마감 알림 받기'."""
    events = await database_rows(request, "GET", "academic_calendar", params={
        "select": "title,end_date", "end_date": f"gte.{date.today().isoformat()}", "limit": 200})
    q = _bigrams(question)
    best = max(events, key=lambda e: len(q & _bigrams(e["title"])), default=None)
    if not best or len(q & _bigrams(best["title"])) < 2:
        return []
    return [{"type": "add_todo", "label": "마감 알림 받기", "payload": {"title": best["title"], "due_date": best["end_date"]}}]


async def _my_info(request: Request, user: AuthenticatedUser, p: dict, topic: str | None, question: str) -> dict:
    """⑫ 내 상황 답변: 서버가 계산한 결과로 카드와 버튼을 만들고, 문장은 AI가 다듬음."""
    cards = []
    if topic == "graduation":
        try:
            g = await graduation_result(request, user)
        except APIError as e:  # 학과 기준 없음·부전공 등: 이유를 그대로 안내
            return {"text": e.message, "cards": [], "actions": []}
        pending = [r["name"] for r in g["requirements"] if r["done"] is not True]
        if g["remaining_total"] is None:
            summary = "같은 과목이 여러 학기에 있어 남은 학점을 정확히 계산할 수 없어요."
        else:
            # AI가 "120학점에서 뺀 값"처럼 계산하려 들지 않게, 남은 학점을 완성된 숫자로 줌
            summary = (f"앞으로 {g['remaining_total']:g}학점 더 들으면 돼요 "
                       f"(지금 {g['earned_total']:g}학점 / 필요 {g['required_total']:g}학점).")
            cards = [{"image_url": None, "title": "졸업까지 남은 학점",
                      "lines": [f"{g['remaining_total']:g}학점", f"{g['earned_total']:g} / {g['required_total']:g}"], "link": None}]
        if pending:
            summary += f" 남은 요건 {len(pending)}가지: " + ", ".join(pending)
        actions = [{"type": "open_screen", "label": "졸업 요건 자세히", "payload": {"screen": "L-2"}}]
    elif topic == "scholarship":
        rows = [r for r in await scholarship_rows(request, user) if r["verdict"] != "ineligible" and not r["applied"]]
        summary = f"신청할 수 있거나 확인이 필요한 장학금이 {len(rows)}개 있어요." if rows else "지금 신청할 수 있는 장학금이 없어요."
        cards = [{"image_url": None, "title": r["title"],
                  "lines": [VERDICT_KO[r["verdict"]], f"마감 {r['deadline'][:10]}" if r["deadline"] else "마감 없음"],
                  "link": None} for r in rows]
        actions = [{"type": "open_screen", "label": "나에게 맞는 장학금", "payload": {"screen": "S-1"}}]
    else:
        rows = await database_rows(request, "GET", "todos", params={
            "user_id": f"eq.{user.id}", "done": "eq.false", "select": "title,due_date", "order": "priority.desc,due_date.asc.nullslast", "limit": 3})
        summary = "챙길 일: " + ", ".join(f"{r['title']}({r['due_date'] or '마감 없음'})" for r in rows) if rows else "지금 챙길 일이 없어요."
        actions = [{"type": "open_screen", "label": "할 일 전체 보기", "payload": {"screen": "T-1"}}]
    text = await run_in_threadpool(tasks.answer_my_info, question, {"summary": summary, "nickname": p["nickname"], "grade": p["grade"]})
    return {"text": text, "cards": cards, "actions": actions}


async def _from_docs(request: Request, question: str) -> dict:
    """⑪ 문서 근거 답변. 근거가 없으면 지어내지 않고 '모른다'."""
    chunks = await search_chunks(request, question)
    answer = await run_in_threadpool(tasks.answer_from_docs, question, chunks)
    if not answer:
        return {"text": UNKNOWN, "cards": [], "sources": [], "actions": [], "unknown": True}
    sources = list({c["title"]: {"title": c["title"], "url": c["url"]} for c in chunks}.values())
    return {"text": answer, "cards": [], "sources": sources, "actions": await _calendar_action(request, question)}


class Context(BaseModel):
    kind: Literal["todo", "notice", "status"]  # status: A-3 휴·복학 화면에서 (id는 안 씀, 앱은 0)
    id: int


class ChatIn(BaseModel):
    conversation_id: int | None = None
    text: str = Field(min_length=1, max_length=500)
    context: Context | None = None


async def _one(request: Request, table: str, **params) -> dict | None:
    rows = await database_rows(request, "GET", table, params={**params, "limit": 1})
    return rows[0] if rows else None


@router.post("/chat")
async def chat(body: ChatIn, request: Request, user: AuthenticatedUser = Depends(require_user)):
    p = await _one(request, "profiles", user_id=f"eq.{user.id}", select="nickname,grade,semester,status")
    if not p:
        raise APIError(404, "PROFILE_NOT_FOUND", "처음 설정이 필요해요.")
    ret = {"Prefer": "return=representation"}
    if body.conversation_id:
        conv = await _one(request, "conversations", id=f"eq.{body.conversation_id}", user_id=f"eq.{user.id}", select="id")
        if not conv:
            raise APIError(404, "NOT_FOUND", "대화를 찾을 수 없어요.")
    else:
        conv = (await database_rows(request, "POST", "conversations", headers=ret,
                                    params={"select": "id"}, json={"user_id": str(user.id), "title": body.text[:30]}))[0]
    await database_rows(request, "POST", "messages", json={"conversation_id": conv["id"], "role": "user", "text": body.text})

    # ⑭ 맥락 이어받기: 할 일·공지에서 넘어오면 그 내용을 질문 앞에 붙여 AI에게 줌
    question = body.text
    if body.context:
        if body.context.kind == "status":
            status = {"enrolled": "재학", "leave": "휴학", "returned": "복학"}.get(p["status"], p["status"])
            ctx = {"title": "내 학적", "reason": f"{p['grade']}학년 {p['semester']}학기, {status} 중"}
        elif body.context.kind == "todo":
            ctx = await _one(request, "todos", id=f"eq.{body.context.id}", user_id=f"eq.{user.id}", select="title,reason")
        else:
            ctx = await _one(request, "notices", id=f"eq.{body.context.id}", select="title,summary")
            if ctx:
                ctx["reason"] = " ".join(ctx["summary"])
        if ctx:
            question = f"[{ctx['title']}] {ctx['reason'] or ''}\n질문: {body.text}"

    route = await run_in_threadpool(tasks.route_question, question)  # ⑩
    reply = await (_my_info(request, user, p, route["topic"], question) if route["intent"] == "my_info" else _from_docs(request, question))

    msg = (await database_rows(request, "POST", "messages", headers=ret, params={"select": MSG_COLS}, json={
        "conversation_id": conv["id"], "role": "assistant", "text": reply["text"],
        "cards": reply["cards"], "sources": reply.get("sources", []), "actions": reply["actions"]}))[0]
    if reply.get("unknown"):  # 관리자 기능(추후)에서 볼 수 있게 기록만
        await database_rows(request, "POST", "unanswered_questions",
                            json={"user_id": str(user.id), "message_id": msg["id"], "question": body.text})
    await database_rows(request, "PATCH", "conversations", params={"id": f"eq.{conv['id']}"}, json={"updated_at": msg["created_at"]})
    return {"conversation_id": conv["id"], "message": msg}


@router.get("/conversations")
async def conversations(request: Request, q: str = "", user: AuthenticatedUser = Depends(require_user)):
    params = {"user_id": f"eq.{user.id}", "select": CONV_COLS, "order": "pinned.desc,updated_at.desc", "limit": 100}
    if q:
        params["title"] = f"ilike.*{q}*"
    return await database_rows(request, "GET", "conversations", params=params)


@router.get("/conversations/{conv_id}")
async def conversation(conv_id: int, request: Request, user: AuthenticatedUser = Depends(require_user)):
    conv = await _one(request, "conversations", id=f"eq.{conv_id}", user_id=f"eq.{user.id}", select=CONV_COLS)
    if not conv:
        raise APIError(404, "NOT_FOUND", "대화를 찾을 수 없어요.")
    messages = await database_rows(request, "GET", "messages", params={
        "conversation_id": f"eq.{conv_id}", "select": MSG_COLS, "order": "id.asc", "limit": 500})
    return {**conv, "messages": messages}


class PinIn(BaseModel):
    pinned: bool


@router.patch("/conversations/{conv_id}")
async def pin(conv_id: int, body: PinIn, request: Request, user: AuthenticatedUser = Depends(require_user)):
    rows = await database_rows(request, "PATCH", "conversations", headers={"Prefer": "return=representation"},
                               params={"id": f"eq.{conv_id}", "user_id": f"eq.{user.id}", "select": CONV_COLS},
                               json={"pinned": body.pinned})
    if not rows:
        raise APIError(404, "NOT_FOUND", "대화를 찾을 수 없어요.")
    return rows[0]
