"""챗봇 POST /chat (H-1, H-2) · 대화 목록 (H-3).
⑩ 의도 파악 → 내 정보면 ⑫ 계산 결과로 답, 문서면 ⑪ 문서 검색 후 근거로 답, 근거가 없으면 '모른다' + 기록."""
import re
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

import agent
import db
from ai import client as ai_client
from ai import tasks
from auth import current_user
from db import Json
from errors import ApiError, not_found

router = APIRouter()
VERDICT_KO = {"eligible": "신청 가능", "check": "확인 필요", "ineligible": "조건 미충족"}
UNKNOWN = "학교 문서에서 근거를 찾지 못했어요. 질문을 기록해 두었으니, 문서가 보강되면 답해 드릴게요."


def _bigrams(s: str) -> set[str]:
    s = re.sub(r"[\s\W_]+", "", s)
    return {s[i:i + 2] for i in range(len(s) - 1)}


def search_chunks(question: str, k: int = 3) -> list[dict]:
    """문서 검색. 임베딩이 있으면 벡터 검색, 없으면(가짜 AI 모드) 두 글자 묶음이 많이 겹치는 문단."""
    vec = ai_client.embed([question])
    if vec:
        return db.all_rows(
            """select c.content, d.title, d.url from doc_chunks c join documents d on d.id = c.document_id
               where c.embedding is not null order by c.embedding <=> %s::vector limit %s""",
            [str(vec[0]), k],
        )
    # shortcut: 문단이 수천 개가 되면 느려짐. 그때는 임베딩(벡터 검색)을 켜기
    rows = db.all_rows("select c.content, d.title, d.url from doc_chunks c join documents d on d.id = c.document_id")
    q = _bigrams(question)
    scored = []
    for r in rows:
        b = _bigrams(r["content"])
        hit = len(q & b)
        if hit >= 3:
            scored.append((hit / len(b) ** 0.5, r))  # 길이로 나눠서 짧고 딱 맞는 문단이 위로
    return [r for _, r in sorted(scored, key=lambda x: -x[0])[:k]]


def _calendar_action(question: str) -> list[dict]:
    """⑬ 다음 행동 버튼 (규칙): 질문과 비슷한 학사일정이 앞으로 있으면 '마감 알림 받기'."""
    q = _bigrams(question)
    events = db.all_rows("select title, start_date, end_date from academic_calendar where coalesce(end_date, start_date) >= current_date")
    best = max(events, key=lambda e: len(q & _bigrams(e["title"])), default=None)
    if not best or len(q & _bigrams(best["title"])) < 2:
        return []
    due = (best["end_date"] or best["start_date"]).isoformat()
    return [{"type": "add_todo", "label": "마감 알림 받기", "payload": {"title": best["title"], "due_date": due}}]


def _my_info(uid: str, p: dict, topic: str | None, question: str) -> dict:
    """⑫ 내 상황 답변: 비서가 계산해 둔 결과로 카드와 버튼을 만들고, 문장은 AI가 다듬음."""
    if topic == "graduation":
        g = agent.graduation_of(p, agent.grades_of(uid))
        if not g:
            return {"text": "학과 졸업 기준이 아직 없어 계산할 수 없어요.", "cards": [], "actions": []}
        pending = [r for r in g["requirements"] if not r["done"]]
        # AI가 "117학점에서 뺀 값"처럼 계산하려 들지 않게, 남은 학점을 완성된 숫자로 줌
        summary = (f"앞으로 {g['remaining_total']}학점 더 들으면 돼요 "
                   f"(지금 {g['earned_total']}학점 / 필요 {g['required_total']}학점).")
        if pending:
            summary += f" 남은 요건 {len(pending)}가지: " + ", ".join(r["name"] for r in pending)
        cards = [{"image_url": None, "title": "졸업까지 남은 학점",
                  "lines": [f"{g['remaining_total']}학점", f"{g['earned_total']} / {g['required_total']}"], "link": None}]
        actions = [{"type": "open_screen", "label": "졸업 요건 자세히", "payload": {"screen": "L-2"}}]
        actions += [{"type": "open_screen", "label": r["name"], "payload": {"screen": "T-2", "id": r["todo_id"]}}
                    for r in pending if r.get("todo_id")][:2]
    elif topic == "scholarship":
        rows = db.all_rows(
            """select n.id, n.title, n.deadline, e.verdict from eligibility e join notices n on n.id = e.notice_id
               where e.user_id = %s and e.verdict <> 'ineligible' and (n.deadline is null or n.deadline >= now())""", [uid])
        summary = f"신청할 수 있거나 확인이 필요한 장학금이 {len(rows)}개 있어요." if rows else "지금 신청할 수 있는 장학금이 없어요."
        cards = [{"image_url": None, "title": r["title"],
                  "lines": [VERDICT_KO[r["verdict"]], f"마감 {r['deadline']:%m/%d %H:%M}" if r["deadline"] else "마감 없음"],
                  "link": None} for r in rows]
        actions = [{"type": "open_screen", "label": "나에게 맞는 장학금", "payload": {"screen": "S-1"}}]
    else:
        rows = db.all_rows("select id, title, due_date from todos where user_id = %s and not done order by priority desc limit 3", [uid])
        summary = "챙길 일: " + ", ".join(f"{r['title']}({r['due_date'] or '마감 없음'})" for r in rows) if rows else "지금 챙길 일이 없어요."
        cards = []
        actions = [{"type": "open_screen", "label": "할 일 전체 보기", "payload": {"screen": "T-1"}}]
    text = tasks.answer_my_info(question, {"summary": summary, "nickname": p["nickname"], "grade": p["grade"]})
    return {"text": text, "cards": cards, "actions": actions}


def _from_docs(question: str) -> dict:
    """⑪ 문서 근거 답변. 근거가 없으면 지어내지 않고 '모른다'."""
    chunks = search_chunks(question)
    answer = tasks.answer_from_docs(question, chunks)
    if not answer:
        return {"text": UNKNOWN, "cards": [], "sources": [], "actions": [], "unknown": True}
    sources = list({c["title"]: {"title": c["title"], "url": c["url"]} for c in chunks}.values())
    return {"text": answer, "cards": [], "sources": sources, "actions": _calendar_action(question)}


class Context(BaseModel):
    kind: Literal["todo", "notice"]
    id: int


class ChatIn(BaseModel):
    conversation_id: int | None = None
    text: str = Field(min_length=1, max_length=500)
    context: Context | None = None


MSG_COLS = "id, role, text, cards, sources, actions, created_at"


@router.post("/chat")
def chat(body: ChatIn, uid: str = Depends(current_user)):
    p = agent.profile_of(uid)
    if not p:
        raise ApiError(404, "NO_PROFILE", "처음 설정이 필요해요")
    if body.conversation_id:
        conv = db.one("select id from conversations where id = %s and user_id = %s", [body.conversation_id, uid])
        if not conv:
            raise not_found("대화")
    else:
        conv = db.one("insert into conversations (user_id, title) values (%s, %s) returning id", [uid, body.text[:30]])
    db.run("insert into messages (conversation_id, role, text) values (%s, 'user', %s)", [conv["id"], body.text])

    # ⑭ 맥락 이어받기: 할 일·공지에서 넘어오면 그 내용을 질문 앞에 붙여 AI에게 줌
    question = body.text
    if body.context:
        if body.context.kind == "todo":
            ctx = db.one("select title, reason from todos where id = %s and user_id = %s", [body.context.id, uid])
        else:
            ctx = db.one("select title, array_to_string(array(select jsonb_array_elements_text(summary)), ' ') as reason "
                         "from notices where id = %s", [body.context.id])
        if ctx:
            question = f"[{ctx['title']}] {ctx['reason'] or ''}\n질문: {body.text}"

    route = tasks.route_question(question)  # ⑩
    reply = _my_info(uid, p, route["topic"], question) if route["intent"] == "my_info" else _from_docs(question)

    msg = db.one(
        f"""insert into messages (conversation_id, role, text, cards, sources, actions)
            values (%s, 'assistant', %s, %s, %s, %s) returning {MSG_COLS}""",
        [conv["id"], reply["text"], Json(reply["cards"]), Json(reply.get("sources", [])), Json(reply["actions"])],
    )
    if reply.get("unknown"):  # 관리자 기능(추후)에서 볼 수 있게 기록만
        db.run("insert into unanswered_questions (user_id, message_id, question) values (%s, %s, %s)", [uid, msg["id"], body.text])
    db.run("update conversations set updated_at = now() where id = %s", [conv["id"]])
    return {"conversation_id": conv["id"], "message": msg}


@router.get("/conversations")
def conversations(q: str = "", uid: str = Depends(current_user)):
    return db.all_rows(
        """select id, title, pinned, updated_at from conversations where user_id = %s and title like %s
           order by pinned desc, updated_at desc""",
        [uid, f"%{q}%"],
    )


@router.get("/conversations/{conv_id}")
def conversation(conv_id: int, uid: str = Depends(current_user)):
    conv = db.one("select id, title, pinned, updated_at from conversations where id = %s and user_id = %s", [conv_id, uid])
    if not conv:
        raise not_found("대화")
    return {**conv, "messages": db.all_rows(f"select {MSG_COLS} from messages where conversation_id = %s order by id", [conv_id])}


class PinIn(BaseModel):
    pinned: bool


@router.patch("/conversations/{conv_id}")
def pin(conv_id: int, body: PinIn, uid: str = Depends(current_user)):
    row = db.one("update conversations set pinned = %s where id = %s and user_id = %s returning id, title, pinned, updated_at",
                 [body.pinned, conv_id, uid])
    if not row:
        raise not_found("대화")
    return row
