"""관리자 웹 (AD-1~AD-5). ADMIN_EMAILS에 있는 학교 메일만, 데이터는 서버 전용 키로.
질문·답은 문장과 숫자만 (누가 물었는지는 안 보여 줌). 계정 관리만 메일·학과·학년·학적을 보여 줌."""
import base64
import binascii
import io
import logging
import re
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Literal
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, BackgroundTasks, Body, Depends, Request
from pydantic import BaseModel, Field, ValidationError
from pypdf import PdfReader
from pypdf.errors import PdfReadError
from starlette.concurrency import run_in_threadpool

from server.auth import require_admin
from server.errors import APIError
from server.jobs.pipeline import pipeline_client
from server.logic.eligibility import matches_target
from server.scripts import load_yoram

router = APIRouter(prefix="/admin", tags=["관리자"], dependencies=[Depends(require_admin)])
log = logging.getLogger("admin")
Cause = Literal["no_document", "outdated", "ambiguous", "notice_missing"]


async def admin_rows(request: Request, method: str, table: str, *, count=False, api="rest/v1", **kwargs):
    """서버 전용 키로 Supabase REST (api="auth/v1/admin"이면 로그인 계정). count=True면 행 대신 개수."""
    s = request.app.state.settings
    if not s.secret_key:
        raise APIError(500, "ADMIN_NOT_CONFIGURED", "서버 .env에 SUPABASE_SECRET_KEY가 필요해요.")
    headers = {"apikey": s.secret_key, "Authorization": f"Bearer {s.secret_key}", **kwargs.pop("headers", {})}
    if count:
        headers["Prefer"] = "count=exact"
        kwargs["params"] = {**kwargs.get("params", {}), "limit": 1, "select": "id"}
    try:
        res = await request.app.state.http.request(method, f"{s.supabase_url}/{api}/{table}", headers=headers, **kwargs)
    except httpx.RequestError:
        raise APIError(500, "DATABASE_UNAVAILABLE", "데이터 서버에 연결할 수 없어요.") from None
    if res.status_code == 404:
        raise APIError(404, "NOT_FOUND", "항목을 찾을 수 없어요.")
    if res.status_code == 409:
        raise APIError(409, "DATA_CONFLICT", "이미 있는 항목과 겹쳐요.")
    if res.status_code == 400:  # 표의 check 조건 위반 (날짜 순서, 학점 0 등)
        raise APIError(400, "INVALID_REQUEST", "입력 값을 확인해 주세요.")
    if res.status_code not in (200, 201, 204, 206):
        raise APIError(500, "DATABASE_ERROR", "데이터를 저장하거나 가져올 수 없어요.")
    if count:
        return int(res.headers.get("content-range", "*/0").rsplit("/", 1)[-1])
    return res.json() if res.content else []


def _since(days: int) -> str:
    return "gte." + (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


# ── AD-1 처리할 일 현황 ──
@router.get("/summary")
async def summary(request: Request):
    week = _since(7)
    async def n(table, **params):
        return await admin_rows(request, "GET", table, count=True, params=params)
    questions = await n("messages", role="eq.user", created_at=week)
    unanswered_week = await n("unanswered_questions", created_at=week)
    return {
        "unanswered_open": await n("unanswered_questions", status="eq.open"),
        "unanswered_week": unanswered_week,
        "questions_week": questions,
        "answer_rate": round((questions - unanswered_week) * 100 / questions) if questions else None,
        "feedback_down_week": await n("messages", feedback="eq.down", created_at=week),
        "notice_failed": await n("notices", extraction_status="eq.failed"),
        "push_failed_week": await n("notifications", delivery_status="in.(failed,unknown)", sent_at=week),
        "students": await n("profiles"),
        "documents": await n("documents"),
    }


# ── AD-2 못한 질문 · 아쉬워요 ──
def _key(question: str) -> str:
    return re.sub(r"[\s\W_]+", "", question).lower()


@router.get("/unanswered")
async def unanswered(request: Request, status: Literal["open", "done"] = "open"):
    # shortcut: 최근 1000건만 묶음. 쌓이면 DB에서 묶는 함수로
    rows = await admin_rows(request, "GET", "unanswered_questions", params={
        "status": f"eq.{status}", "select": "id,question,cause,created_at", "order": "id.desc", "limit": 1000})
    groups: dict[str, dict] = {}
    for r in rows:  # 최신순이라 첫 행이 대표 문장
        g = groups.setdefault(_key(r["question"]), {"question": r["question"], "ids": [], "count": 0,
                                                    "cause": r["cause"], "last_at": r["created_at"]})
        g["ids"].append(r["id"])
        g["count"] += 1
    return sorted(groups.values(), key=lambda g: (-g["count"], g["last_at"]))


class UnansweredPatch(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=1000)
    status: Literal["open", "done"] | None = None
    cause: Cause | None = None


@router.patch("/unanswered")
async def update_unanswered(body: UnansweredPatch, request: Request):
    values = body.model_dump(include=body.model_fields_set - {"ids"})
    if "status" in values:
        values["resolved_at"] = datetime.now(timezone.utc).isoformat() if values["status"] == "done" else None
    if not values:
        raise APIError(400, "INVALID_REQUEST", "바꿀 값이 없어요.")
    await admin_rows(request, "PATCH", "unanswered_questions",
                     params={"id": f"in.({','.join(map(str, body.ids))})"}, json=values)
    return {"updated": len(body.ids)}


@router.get("/feedback")
async def feedback(request: Request):
    """'아쉬워요'(👎) 받은 답과 그 앞 질문. 최근 30일."""
    answers = await admin_rows(request, "GET", "messages", params={
        "feedback": "eq.down", "created_at": _since(30), "select": "id,conversation_id,text,created_at",
        "order": "id.desc", "limit": 100})
    if not answers:
        return []
    asked = await admin_rows(request, "GET", "messages", params={
        "conversation_id": f"in.({','.join({str(a['conversation_id']) for a in answers})})",
        "role": "eq.user", "select": "id,conversation_id,text", "order": "id.asc", "limit": 5000})
    def question(a):
        before = [m for m in asked if m["conversation_id"] == a["conversation_id"] and m["id"] < a["id"]]
        return before[-1]["text"] if before else None
    return [{"id": a["id"], "question": question(a), "answer": a["text"], "created_at": a["created_at"]} for a in answers]


# ── AD-3 참고 자료 (문서·관리자 답변) ──
@router.get("/documents")
async def documents(request: Request):
    rows = await admin_rows(request, "GET", "documents", params={
        "select": "id,title,url,kind,created_at,doc_chunks(count)", "order": "id.desc", "limit": 500})
    return [{**{k: v for k, v in r.items() if k != "doc_chunks"}, "chunks": (r.get("doc_chunks") or [{}])[0].get("count", 0)}
            for r in rows]


def _save_document(title: str, url: str | None, kind: str, contents: list[str]) -> None:
    # 학사요람 적재 스크립트와 같은 길: 문서·문단 저장 후 임베딩 (가짜 AI 모드면 글자 검색)
    with load_yoram._db() as db:
        load_yoram._insert(db, title, url, kind, contents)
        load_yoram.embed_missing(db)


class DocumentIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    kind: Literal["학사요람", "규정", "공지", "기타"]
    url: str | None = Field(default=None, max_length=500)
    filename: str = Field(min_length=1, max_length=200)
    content_base64: str = Field(min_length=1, max_length=28_000_000)  # 파일 20MB


def _text_of(filename: str, data: bytes) -> str:
    name = filename.lower()
    try:
        if name.endswith(".pdf"):
            return load_yoram._unspace("\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(data)).pages))
        if name.endswith((".txt", ".md")):
            return data.decode("utf-8-sig")
    except (PdfReadError, UnicodeDecodeError, ValueError):
        raise APIError(400, "INVALID_FILE", "파일을 읽을 수 없어요. PDF나 UTF-8 텍스트인지 확인해 주세요.") from None
    raise APIError(400, "INVALID_FILE", "PDF, TXT, MD 파일만 올릴 수 있어요.")


@router.post("/documents", status_code=201)
async def upload_document(body: DocumentIn, request: Request):
    try:
        data = base64.b64decode(body.content_base64, validate=True)
    except (binascii.Error, ValueError):
        raise APIError(400, "INVALID_FILE", "파일을 읽을 수 없어요.") from None
    text = await run_in_threadpool(_text_of, body.filename, data)
    contents = [f"[{body.title}] " + re.sub(r"[ \t]+", " ", c).strip() for c in load_yoram._pack(text)]
    contents = [c for c in contents if len(c) >= 40]
    if not contents:
        raise APIError(400, "EMPTY_DOCUMENT", "글자를 뽑을 수 없어요. 스캔한 이미지 PDF는 지원하지 않아요.")
    await run_in_threadpool(_save_document, body.title, body.url, body.kind, contents)
    return {"chunks": len(contents)}


@router.delete("/documents/{doc_id}", status_code=204)
async def delete_document(doc_id: int, request: Request):
    await admin_rows(request, "DELETE", "documents", params={"id": f"eq.{doc_id}"})  # 문단은 cascade


class AnswerIn(BaseModel):
    question: str = Field(min_length=1, max_length=300)
    answer: str = Field(min_length=1, max_length=2000)
    ids: list[int] = Field(default=[], max_length=1000)  # 이 답으로 처리할 못한 질문


@router.post("/answers", status_code=201)
async def write_answer(body: AnswerIn, request: Request):
    """관리자가 쓴 답을 문서 한 문단으로 저장 → 챗봇이 다른 문서처럼 찾아 근거로 씀."""
    q, a = body.question.strip(), body.answer.strip()
    await run_in_threadpool(_save_document, f"관리자 답변 · {q[:40]}", None, "관리자 답변", [f"[관리자 답변] 질문: {q}\n답: {a}"])
    if body.ids:
        await update_unanswered(UnansweredPatch(ids=body.ids, status="done"), request)
    return {"ok": True}


# ── 공지 수집 상태 (AI 정리 실패 다시 하기). 관리자가 보낸 공지는 '보낸 공지'에서 따로 봄 ──
SENT = "like.admin-*"
COLLECTED = "not.like.admin-*"
KST = timezone(timedelta(hours=9))


@router.get("/notices/stats")
async def notice_stats(request: Request):
    today = "gte." + datetime.now(KST).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    async def n(**params):
        return await admin_rows(request, "GET", "notices", count=True, params={"board_post_id": COLLECTED, **params})
    last = await admin_rows(request, "GET", "notices", params={
        "board_post_id": COLLECTED, "select": "created_at", "order": "id.desc", "limit": 1})
    return {
        "today": await n(created_at=today),
        "today_ready": await n(created_at=today, extraction_status="eq.ready"),
        "pending": await n(extraction_status="eq.pending"),
        "failed": await n(extraction_status="eq.failed"),
        "last_collected_at": last[0]["created_at"] if last else None,
    }


@router.get("/notices")
async def notices(request: Request, status: Literal["pending", "ready", "failed"] | None = None):
    params = {"board_post_id": COLLECTED, "select": "id,title,category,extraction_status,posted_at,url", "order": "id.desc", "limit": 100}
    if status:
        params["extraction_status"] = f"eq.{status}"
    return await admin_rows(request, "GET", "notices", params=params)


@router.post("/notices/{notice_id}/retry")
async def retry_notice(notice_id: int):
    async with pipeline_client() as pipe:
        return await pipe.extract(notice_id=notice_id)


# ── AD-4 공지 발송: notices에 '학생지원팀' 공지로 넣고, 학생별 판정·할 일·푸시는 아침 파이프라인 함수 그대로 ──
class Target(BaseModel):
    grades: list[int] = Field(default=[], max_length=6)
    departments: list[str] = Field(default=[], max_length=50)
    statuses: list[Literal["enrolled", "leave", "returned"]] = []


class BroadcastIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=5000)
    category: Literal["학사", "장학", "일반"]
    deadline: datetime | None = None
    target: Target = Target()


async def _all_rows(request: Request, table: str, **params) -> list[dict]:
    rows, page = [], None
    while page is None or len(page) == 1000:
        page = await admin_rows(request, "GET", table, params={**params, "order": "id.asc", "offset": len(rows), "limit": 1000})
        rows += page
    return rows


async def _students(request: Request, select="grade,department,status", consented=True) -> list[dict]:
    return await _all_rows(request, "profiles", select=select, **({"consent_agreed_at": "not.is.null"} if consented else {}))


@router.post("/broadcast/preview")
async def broadcast_preview(target: Target, request: Request):
    t = target.model_dump()
    return {"count": sum(matches_target(t, p) for p in await _students(request))}


async def _send_broadcast(notice: dict):
    try:
        async with pipeline_client() as pipe:
            for p in await pipe.rows("profiles", consent_agreed_at="not.is.null"):
                try:
                    await pipe.student(p, [notice], use_ai=False, notify=True)
                except Exception as exc:  # 한 학생 실패로 나머지를 멈추지 않음
                    log.warning("broadcast student failed type=%s", type(exc).__name__)
    except Exception as exc:
        log.warning("broadcast failed notice=%s type=%s", notice["id"], type(exc).__name__)


@router.post("/broadcast", status_code=202)
async def broadcast(body: BroadcastIn, request: Request, tasks: BackgroundTasks):
    key = f"admin-{uuid4().hex}"
    notice = (await admin_rows(request, "POST", "notices", headers={"Prefer": "return=representation"}, json={
        "board_post_id": key, "url": f"admin:{key}",  # 학교 게시판 글이 아니라 원문 주소 없음 (앱은 https만 엶)
        "title": body.title.strip(), "body": body.body, "category": body.category,
        "posted_at": datetime.now(timezone.utc).isoformat(), "summary": [body.body.strip()[:120]],
        "deadline": body.deadline.isoformat() if body.deadline else None,
        "target": {k: v for k, v in body.target.model_dump().items() if v}, "extraction_status": "ready"}))[0]
    tasks.add_task(_send_broadcast, notice)
    return {"notice_id": notice["id"]}


@router.get("/broadcasts")
async def broadcasts(request: Request):
    # shortcut: 최근 100건만. 더 오래된 공지를 찾을 일이 생기면 페이지 넘김 추가
    rows = await admin_rows(request, "GET", "notices", params={
        "board_post_id": SENT, "select": "id,title,body,category,deadline,target,posted_at", "order": "id.desc", "limit": 100})
    if not rows:
        return []
    ids = f"in.({','.join(str(r['id']) for r in rows)})"
    listed = Counter(e["notice_id"] for e in await _all_rows(
        request, "eligibility", notice_id=ids, verdict="in.(eligible,check)", select="notice_id"))
    notified = Counter(n["target_id"] for n in await _all_rows(
        request, "notifications", type="eq.notice", target_id=ids, delivery_status="not.in.(failed,unknown)", select="target_id"))
    return [{**r, "listed": listed[r["id"]], "notified": notified[r["id"]]} for r in rows]


@router.delete("/broadcasts/{notice_id}", status_code=204)
async def retract_broadcast(notice_id: int, request: Request):
    todos = await _all_rows(request, "todos", source_kind="eq.notice", source_id=f"eq.{notice_id}", select="id")
    # 판정·할 일·신청 기록은 외래 키 cascade. 학교 게시판 공지는 여기서 못 지움
    found = await admin_rows(request, "DELETE", "notices", headers={"Prefer": "return=representation"}, params={
        "id": f"eq.{notice_id}", "board_post_id": SENT, "select": "id"})
    if not found:
        raise APIError(404, "NOT_FOUND", "보낸 공지를 찾을 수 없어요.")
    # 알림은 외래 키가 없어 따로 지움. 안 지우면 학생 알림함에 열리지 않는 항목이 남음
    await admin_rows(request, "DELETE", "notifications", params={"type": "eq.notice", "target_id": f"eq.{notice_id}"})
    ids = [t["id"] for t in todos]
    for i in range(0, len(ids), 200):  # 주소 길이 제한
        await admin_rows(request, "DELETE", "notifications", params={
            "type": "eq.deadline", "target_id": f"in.({','.join(map(str, ids[i:i + 200]))})"})


# ── 계정 관리: 가입자 목록·삭제. 삭제는 학생 앱 탈퇴(/me DELETE)와 같은 길, 개인 데이터는 외래 키 cascade ──
@router.get("/users")
async def users(request: Request):
    accounts, page = [], 1
    while True:
        batch = (await admin_rows(request, "GET", "users", api="auth/v1/admin", params={"page": page, "per_page": 1000}))["users"]
        accounts += batch
        if len(batch) < 1000:
            break
        page += 1
    profiles = {p["user_id"]: p for p in await _students(request, "user_id,department,grade,status", consented=False)}
    admins = request.app.state.settings.admin_emails
    return sorted(({
        "id": a["id"], "email": a.get("email"), "created_at": a["created_at"], "last_sign_in_at": a.get("last_sign_in_at"),
        "admin": (a.get("email") or "").lower() in admins,
        **{k: profiles.get(a["id"], {}).get(k) for k in ("department", "grade", "status")},
    } for a in accounts), key=lambda u: u["created_at"], reverse=True)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: UUID, request: Request):
    account = await admin_rows(request, "GET", f"users/{user_id}", api="auth/v1/admin")
    if (account.get("email") or "").lower() in request.app.state.settings.admin_emails:
        raise APIError(400, "ADMIN_ACCOUNT", "관리자 계정은 여기서 지울 수 없어요. .env의 ADMIN_EMAILS에서 먼저 빼 주세요.")
    await admin_rows(request, "DELETE", f"users/{user_id}", api="auth/v1/admin")


# ── AD-5 학교 자료: 학사일정·과목은 고치기, 졸업 기준은 보기만 ──

class CalendarIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    start_date: date
    end_date: date
    target_grades: list[int] = Field(default=[], max_length=6)
    source_url: str = Field(min_length=1, max_length=500)


class CourseIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    credits: float = Field(gt=0, le=30)
    area: str = Field(min_length=1, max_length=100)
    times: list[dict] = []


TABLES = {
    "calendar": ("academic_calendar", CalendarIn, "id,title,start_date,end_date,target_grades,source_url", "start_date.asc,id.asc"),
    "courses": ("courses", CourseIn, "*", "name.asc,id.asc"),
}
Kind = Literal["calendar", "courses"]


def _valid(kind: str, body: dict) -> dict:
    try:
        return TABLES[kind][1].model_validate(body).model_dump(mode="json")
    except ValidationError:
        raise APIError(400, "INVALID_REQUEST", "입력 값을 확인해 주세요.") from None


@router.get("/data/{kind}")
async def data_rows(kind: Kind, request: Request, q: str = ""):
    table, _, cols, order = TABLES[kind]
    params = {"select": cols, "order": order, "limit": 2000}
    q = re.sub(r"[,()*]", "", q).strip()  # PostgREST 필터 문법 글자는 빼고 검색
    if q and kind == "courses":
        params["or"] = f"(name.ilike.*{q}*,area.ilike.*{q}*)"
    elif q:
        params["title"] = f"ilike.*{q}*"
    return await admin_rows(request, "GET", table, params=params)


@router.post("/data/{kind}", status_code=201)
async def data_create(kind: Kind, request: Request, body: dict = Body()):
    table, _, cols, _ = TABLES[kind]
    return (await admin_rows(request, "POST", table, headers={"Prefer": "return=representation"},
                             params={"select": cols}, json=_valid(kind, body)))[0]


@router.put("/data/{kind}/{row_id}")
async def data_update(kind: Kind, row_id: int, request: Request, body: dict = Body()):
    table, _, cols, _ = TABLES[kind]
    rows = await admin_rows(request, "PATCH", table, headers={"Prefer": "return=representation"},
                            params={"id": f"eq.{row_id}", "select": cols}, json=_valid(kind, body))
    if not rows:
        raise APIError(404, "NOT_FOUND", "항목을 찾을 수 없어요.")
    return rows[0]


@router.delete("/data/{kind}/{row_id}", status_code=204)
async def data_delete(kind: Kind, row_id: int, request: Request):
    await admin_rows(request, "DELETE", TABLES[kind][0], params={"id": f"eq.{row_id}"})


# ── 분실물: 전체 글 보기(보관 장소 포함)·부적절한 글 지우기 ──
@router.get("/lost-items")
async def lost_items(request: Request, status: Literal["open", "closed"] | None = None):
    params = {"select": "id,title,category,place,found_on,storage_place,image_path,status,created_at", "order": "id.desc", "limit": 500}
    if status:
        params["status"] = f"eq.{status}"
    url = request.app.state.settings.supabase_url
    return [{**r, "image_url": r["image_path"] and f"{url}/storage/v1/object/public/lost-items/{r['image_path']}"}
            for r in await admin_rows(request, "GET", "lost_items", params=params)]


@router.delete("/lost-items/{item_id}", status_code=204)
async def delete_lost_item(item_id: int, request: Request):
    rows = await admin_rows(request, "DELETE", "lost_items", headers={"Prefer": "return=representation"},
                            params={"id": f"eq.{item_id}", "select": "image_path"})
    if rows and rows[0]["image_path"]:
        await admin_rows(request, "DELETE", f"lost-items/{rows[0]['image_path']}", api="storage/v1/object")


@router.get("/graduation")
async def graduation(request: Request):
    return await admin_rows(request, "GET", "grad_requirements", params={
        "select": "id,department,admission_year,total_credits,areas,required_courses,certifications",
        "order": "department.asc,admission_year.asc", "limit": 1000})
