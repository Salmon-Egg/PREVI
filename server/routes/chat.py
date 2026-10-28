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
CAN_DO = "휴학·복학 같은 학사 규정, 장학금 조건, 졸업까지 남은 학점, 할 일 마감을 도와드릴 수 있어요."
UNKNOWN = "그건 아직 제가 가진 학교 자료에 없어서 정확히 말씀드리기 어려워요. 질문은 기록해 두었어요. " + CAN_DO
OFF_TOPIC = "그건 제가 도와드리기 어려운 질문이에요. 저는 서경대 생활 비서라서, " + CAN_DO
# 상담센터: counsel.skuniv.ac.kr (10/29 확인). 109는 2024년부터 자살예방 상담 통합번호
CRISIS = ("많이 힘드셨겠어요. 혼자 견디지 마시고, 지금 바로 이야기 나눌 수 있는 곳에 연락해 주세요.\n"
          "· 서경대 학생상담센터 02-940-7607 (청운관 5층)\n· 자살예방 상담전화 109 (24시간)")
# 학교 생활 질문인데 자료가 없는 것만 기록 (학교와 무관한 질문까지 쌓이면 자료 보강 목록으로 못 씀)
SCHOOL = re.compile("학교|서경|캠퍼스|학식|식당|도서관|열람실|셔틀|기숙사|생활관|주차|동아리|강의실|교수|수업|시험|등록금|"
                    "학생증|학과|학사|성적|수강|휴학|복학|졸업|장학|학점|교양|전공|학기|과목")
# 학생마다 답이 다른 질문에만 학생 정보를 넘김. 넘기면 묻지 않아도 "소프트웨어학과 2023입학생 기준"을 붙여서(10/29 실측),
# 학과·입학년도는 학과별로 규정이 다른 졸업·학점 질문에만
PERSONAL = re.compile("휴학|복학|졸업|학점|장학|학년|전공|수강|등록")
BY_DEPT = re.compile("졸업|학점|전공|교양")
STATUS_KO = {"enrolled": "재학", "leave": "휴학", "returned": "복학"}
MSG_COLS = "id,role,text,cards,sources,actions,created_at"
NOTICE_COLS = "title,summary,body,url,deadline"
FOLLOW_UP = re.compile("그럼|그러면|그건|그거|그게|그때|거기|이건|이거|그리고|또 ")
# 학사일정 제목 어디에나 있는 말: 이것만 겹치면 엉뚱한 일정에 '마감 알림 받기'가 붙음
COMMON = re.compile("신청|기간|학기|마감|안내|언제|일정")
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
    def grams(s):
        return _bigrams(COMMON.sub(" ", s))
    q = grams(question.rsplit("질문:", 1)[-1])  # 맥락 제목이 아니라 학생이 실제로 물은 말로
    best = max(events, key=lambda e: len(q & grams(e["title"])), default=None)
    if not best or len(q & grams(best["title"])) < 2:
        return []
    return [{"type": "add_todo", "label": "마감 알림 받기", "payload": {"title": best["title"], "due_date": best["end_date"]}}]


async def _my_info(request: Request, user: AuthenticatedUser, p: dict, topic: str | None, question: str) -> dict:
    """⑫ 내 상황 답변: 서버가 계산한 결과로 카드와 버튼을 만들고, 문장은 AI가 다듬음."""
    cards = []
    if topic == "graduation":
        try:
            g = await graduation_result(request, user)
        except APIError as e:  # 학과 기준 없음·부전공 등: 이유를 그대로 안내하고, 답 못 한 질문으로 기록
            return {"text": e.message, "cards": [], "actions": [], "unknown": True}
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
    text = await run_in_threadpool(tasks.answer_my_info, question, {"summary": summary, "grade": p["grade"]})  # 이름은 첫인사에서만 부르니 안 넘김
    return {"text": text, "cards": cards, "actions": actions}


def _notice_chunk(n: dict) -> dict:
    """공지·공지에서 온 할 일에서 넘어온 질문은 그 공지 원문을 첫 근거로 (학교 문서에는 공지 내용이 없음)."""
    head = f"[공지] {n['title']}" + (f" (마감 {n['deadline'][:16].replace('T', ' ')})" if n["deadline"] else "")
    return {"content": f"{head}\n{(n['body'] or '')[:1500]}", "title": n["title"], "url": n["url"]}


def _used(answer: str, chunks: list[dict]) -> list[dict]:
    """출처는 답과 글자가 많이 겹치는 문단만 (AI가 쓰지 않은 문단의 문서까지 보여 주지 않게)."""
    a = _bigrams(answer)
    hits = [len(a & _bigrams(c["content"])) for c in chunks]
    return [c for c, h in zip(chunks, hits) if h >= max(hits) / 2]


async def _from_docs(request: Request, question: str, p: dict, extra: list[dict]) -> dict:
    """⑪ 문서 근거 답변. 근거가 없으면 지어내지 않고 '모른다'."""
    # 지금 질문만으로 먼저 찾고, 못 찾을 때만 앞 대화·맥락을 붙여 다시 (앞 주제 문단이 새 질문을 덮지 않게)
    asked = question.rsplit("질문:", 1)[-1]
    chunks = extra + (await search_chunks(request, asked) or (asked != question and await search_chunks(request, question)) or [])
    student = {"학적": STATUS_KO.get(p["status"], p["status"])} if PERSONAL.search(asked) else {}
    if BY_DEPT.search(asked):
        student |= {"학과": p["department"], "입학년도": p["admission_year"], "학년": p["grade"]}
    answer = await run_in_threadpool(tasks.answer_from_docs, question, chunks, student)
    if not answer:
        school = SCHOOL.search(asked)
        return {"text": UNKNOWN if school else OFF_TOPIC, "cards": [], "sources": [], "actions": [], "unknown": bool(school)}
    sources = list({c["title"]: {"title": c["title"], "url": c["url"]} for c in _used(answer, chunks)}.values())
    actions = await _calendar_action(request, question)
    if actions:  # 버튼 안내는 코드가 씀 (AI에게 맡기면 없는 버튼을 말할 수 있음)
        answer += " 아래 버튼으로 마감 알림을 받아 둘 수 있어요."
    return {"text": answer, "cards": [], "sources": sources, "actions": actions}


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
    p = await _one(request, "profiles", user_id=f"eq.{user.id}", select="nickname,grade,semester,status,department,admission_year")
    if not p:
        raise APIError(404, "PROFILE_NOT_FOUND", "처음 설정이 필요해요.")
    ret = {"Prefer": "return=representation"}
    last = None
    if body.conversation_id:
        conv = await _one(request, "conversations", id=f"eq.{body.conversation_id}", user_id=f"eq.{user.id}", select="id")
        if not conv:
            raise APIError(404, "NOT_FOUND", "대화를 찾을 수 없어요.")
        # 직전 질문: "그럼 복학은?"처럼 앞 말을 생략한 질문을 이해하게.
        # 앞 답은 넘기지 않음: 넘기면 주제가 바뀐 질문에도 AI가 앞 답을 그대로 베낌(10/29 실측)
        last = await _one(request, "messages", conversation_id=f"eq.{conv['id']}", role="eq.user", select="text", order="id.desc")
    else:
        conv = (await database_rows(request, "POST", "conversations", headers=ret,
                                    params={"select": "id"}, json={"user_id": str(user.id), "title": body.text[:30]}))[0]
    await database_rows(request, "POST", "messages", json={"conversation_id": conv["id"], "role": "user", "text": body.text})

    # ⑭ 맥락 이어받기: 앞 대화, 할 일·공지에서 넘어온 내용을 질문 앞에 붙여 AI에게 줌 ("질문:" 뒤가 실제 질문)
    lines, notice = [], None
    # 앞 말을 받는 질문에만 붙임: 주제가 바뀐 질문("학식 메뉴 뭐야?")에 붙이면 앞 주제로 답함(10/29 실측)
    if last and (FOLLOW_UP.match(body.text.strip()) or len(body.text.strip()) <= 6):
        lines.append(f"[이전 질문] {last['text']}")
    if body.context:
        if body.context.kind == "status":
            status = STATUS_KO.get(p["status"], p["status"])
            ctx = {"title": "내 학적", "reason": f"{p['grade']}학년 {p['semester']}학기, {status} 중"}
        elif body.context.kind == "todo":
            ctx = await _one(request, "todos", id=f"eq.{body.context.id}", user_id=f"eq.{user.id}", select="title,reason,source_kind,source_id")
            if ctx and ctx["source_kind"] == "notice":
                notice = await _one(request, "notices", id=f"eq.{ctx['source_id']}", select=NOTICE_COLS)
        else:
            ctx = notice = await _one(request, "notices", id=f"eq.{body.context.id}", select=NOTICE_COLS)
            if ctx:
                ctx = {"title": ctx["title"], "reason": " ".join(ctx["summary"] or [])}
        if ctx:
            lines.append(f"[{ctx['title']}] {ctx['reason'] or ''}")
    question = "\n".join(lines + [f"질문: {body.text}"]) if lines else body.text

    route = await run_in_threadpool(tasks.route_question, question)  # ⑩
    if route["intent"] == "crisis":
        reply = {"text": CRISIS, "cards": [], "actions": []}
    elif route["intent"] == "smalltalk":
        text = ("도움이 됐다니 다행이에요. 또 궁금한 게 있으면 언제든 물어봐 주세요." if route["topic"] == "thanks"
                else f"안녕하세요, {p['nickname']}님! 저는 PREVI예요. {CAN_DO}")  # 이름은 첫인사에서만 부름
        reply = {"text": text, "cards": [], "actions": []}
    elif route["intent"] == "my_info":
        reply = await _my_info(request, user, p, route["topic"], question)
    else:
        reply = await _from_docs(request, question, p, [_notice_chunk(notice)] if notice else [])

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
