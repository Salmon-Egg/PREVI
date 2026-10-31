"""챗봇 POST /chat (H-1, H-2) · 대화 목록 (H-3).
⑩ 의도 파악 → 내 정보면 ⑫ 계산 결과로 답, 문서면 ⑪ 문서 검색 후 근거로 답, 근거가 없으면 '모른다' + 기록.
AI 호출은 동기 함수라 run_in_threadpool로 돌려 서버가 멈추지 않게 함."""
import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from server.ai import client as ai_client
from server.ai import tasks
from server.auth import AuthenticatedUser, require_user
from server.database import database_rows
from server.errors import APIError
from server.logic.profile_chat import ASKS, asked_field, describe, profile_updates
from server.logic.student_context import calendar_applies
from server.routes.graduation import graduation_result
from server.routes.scholarships import scholarship_rows
from server.routes.todos import shown_reason

router = APIRouter(tags=["챗봇"])
log = logging.getLogger("chat")
VERDICT_KO = {"eligible": "신청 가능", "check": "확인 필요", "ineligible": "조건 미충족"}
CAN_DO = "휴학·복학 같은 학사 규정, 장학금 조건, 졸업까지 남은 학점, 할 일 마감을 도와드릴 수 있어요."
UNKNOWN = "그건 아직 제가 가진 학교 자료에 없어서 정확히 말씀드리기 어려워요. 질문은 기록해 두었어요. " + CAN_DO
OFF_TOPIC = "그건 제가 도와드리기 어려운 질문이에요. 저는 서경대 생활 비서라서, " + CAN_DO
# 상담센터 번호: 학교 공식 공지 /notice/52226, 위치: /notice/45773 (2026-10-31 웹 확인).
# 확인 출처·범위는 docs/상담센터_연락처_확인_20261031.md 참고.
CRISIS = ("많이 힘드셨겠어요. 혼자 견디지 마시고, 지금 바로 이야기 나눌 수 있는 곳에 연락해 주세요.\n"
          "· 서경대 학생상담센터 02-940-7607 (청운관 5층)\n· 자살예방 상담전화 109 (24시간)")
# 학교 생활 질문인데 자료가 없는 것만 기록 (학교와 무관한 질문까지 쌓이면 자료 보강 목록으로 못 씀)
SCHOOL = re.compile("학교|서경|캠퍼스|학식|식당|도서관|열람실|셔틀|기숙사|생활관|주차|동아리|강의실|교수|수업|시험|등록금|"
                    "학생증|학과|학사|성적|수강|휴학|복학|졸업|장학|학점|교양|전공|학기|과목|제도|신청|절차|"
                    "전과|편입|재입학|자퇴|제적|학칙")
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
WHEN = re.compile("언제|며칠|날짜|일정|기간")
WEEK = re.compile(r"(이번|다음)\s*주")
WEEK_TOPIC = re.compile("일정|학사|행사")
KST = timezone(timedelta(hours=9))
NO_DEADLINE = "마감일 확인 필요"
CONV_COLS = "id,title,pinned,updated_at"
# 주제 낱말만 있는 질문("휴학 알려줘")은 걸리는 문단이 많아 답이 길고 흐려짐 → AI 없이 무엇이 궁금한지 버튼으로 되물음
CLARIFY = {
    "휴학": [("최대 기간", "휴학은 최대 몇 학기까지 할 수 있어?"), ("신청 방법", "휴학 신청 방법 알려줘"), ("신청 기간", "휴학 신청은 언제 해?")],
    "복학": [("신청 시기", "복학 신청은 언제 해?"), ("신청 방법", "복학 신청 방법 알려줘")],
    "장학금": [("내가 받을 수 있는 장학금", "나 장학금 받을 수 있어?"), ("성적우수 장학금 조건", "성적우수 장학금 조건이 뭐야?")],
    "졸업": [("내 남은 학점", "나 졸업까지 몇 학점 남았어?"), ("졸업 총 학점", "졸업 총 학점은 몇 학점이야?"), ("졸업 요건", "졸업 요건이 뭐야?")],
    "수강신청": [("신청 기간", "수강신청 언제야?"), ("최대 학점", "한 학기 최대 몇 학점까지 들을 수 있어?")],
    "계절학기": [("최대 학점", "계절학기는 몇 학점까지 들을 수 있어?"), ("일정", "계절학기 언제야?")],
}
CLARIFY["장학"] = CLARIFY["장학금"]
VAGUE_TAIL = re.compile(r"\s*(에\s*대해서?|관련해서?)?\s*(좀\s*)?(알려\s*줘|알려\s*주세요|설명해\s*줘|궁금해|뭐야)?\s*[?？.!~]*\s*$")


def _bigrams(s: str) -> set[str]:
    s = re.sub(r"[\s\W_]+", "", s)
    return {s[i:i + 2] for i in range(len(s) - 1)}


TITLE_TAIL = {"허가", "기준", "관리", "방법", "절차", "신청"}  # 조 제목에 붙는 흔한 말: 학생은 "전과 허가"라고 묻지 않음


def _title_asked(title: str, question: str) -> bool:
    """조 제목 낱말이 질문에 모두 있는지. "졸업의 취소"는 '취소'가 없으면 졸업 질문에 안 걸림."""
    words = [w for w in re.split(r"의\s|\s|및", title) if w and w not in TITLE_TAIL]
    asked = re.sub(r"\s", "", question)
    return bool(words) and all(w in asked for w in words)


def rank_chunks(rows: list[dict], question: str, k: int = 3) -> list[dict]:
    """거리 기준 통과 문단 위주로. 질문이 조 제목을 직접 말한 문단은 거리와 상관없이 1위로:
    "전과"처럼 짧은 질문은 맞는 조도 거리가 멀어(10/31 실측 0.72) 기준에 걸림."""
    hit = next((r for r in rows if _title_asked(ai_client.article_title(r["content"]), question)), None)
    rows = [r for r in rows if r["distance"] <= ai_client.DOC_MAX_DISTANCE and r is not hit]
    return ([hit] + rows if hit else rows)[:k]


GRAD_DOC = re.compile(r"\[졸업요건 정리\(\d+\) · ([^\]]+)\]")


def _for_student(rows: list[dict], p: dict, question: str) -> list[dict]:
    """다른 학과 졸업요건 문단은 뺌: 내용이 진짜여도 이 학생에겐 틀린 답(소프트웨어학과에 파이낸스앤테크전공 요건, 10/31 실측).
    질문이 그 학과를 직접 말하면 둠."""
    asked = re.sub(r"\s", "", question)
    def applies(r):
        m = GRAD_DOC.match(r["content"])
        if not m or m[1] == p["department"] or m[1].replace(" ", "") in asked:
            return True
        return m[1] == "2017~2024학번 공통" and (p["admission_year"] or 9999) <= 2024
    return [r for r in rows if applies(r)]


async def _titled_chunks(request: Request, question: str) -> list[dict]:
    """조 제목이 질문 낱말로 시작하는 문단을 글자로 찾음: "전과 조건 알려줘"는 전과 조가 벡터 후보 밖이라 검색이 비었음(10/31 실측)."""
    words = {w[:2] for w in re.findall("[가-힣]{2,}", question)}  # 앞 두 글자: "전과는"의 조사를 떼려고. 맞는지는 rank_chunks가 다시 봄
    if not words:
        return []
    rows = await database_rows(request, "GET", "doc_chunks", params={
        "select": "content,document:documents(title,url)", "limit": 100,
        "or": "(" + ",".join(f'content.like."[*조*({w}*"' for w in words) + ")"})
    return [{"content": r["content"], **r["document"], "distance": float("inf")} for r in rows]


async def search_chunks(request: Request, question: str, k: int = 3, p: dict | None = None) -> list[dict]:
    """문서 검색. 임베딩이 있으면 벡터 검색(match_doc_chunks), 없으면(가짜 AI 모드) 두 글자 묶음이 많이 겹치는 문단."""
    vec = await run_in_threadpool(ai_client.embed, [ai_client.QUERY_FMT.format(question)])
    if vec:
        # 후보를 넉넉히 받아, 조 제목 낱말("전과의 허가" → 전과)이 질문에 모두 있는 가장 가까운 문단 1개를 1위로
        # ("전과" 질문에 부전공 조가 1위로 오던 문제, G8). 1개만: 원래 1위는 2위로 밀릴 뿐 AI에 같이 감
        # 30개: 학과별 졸업요건 문단이 후보를 채워서, 다른 학과를 뺀 뒤에도 남게
        rows = await database_rows(request, "POST", "rpc/match_doc_chunks",
                                   json={"query_embedding": str(vec[0]), "match_count": 30})
        log.info("문서 거리 %s: %s", question[:30], [round(r["distance"], 3) for r in rows[:10]])  # 기준 숫자 정할 때 봄
        rows += await _titled_chunks(request, question)  # 뒤에 붙임: 벡터 후보에 제목 일치가 있으면 그게 먼저
        return rank_chunks(_for_student(rows, p, question) if p else rows, question, k)
    # shortcut: 문단을 전부 받아 비교함. 문단이 수천 개가 되면 느려지니 그때는 임베딩(벡터 검색)을 켜기
    rows = await database_rows(request, "GET", "doc_chunks", params={"select": "content,document:documents(title,url)", "limit": 2000})
    if p:
        rows = _for_student(rows, p, question)
    q = _bigrams(question)
    scored = []
    for r in rows:
        b = _bigrams(r["content"])
        hit = len(q & b)
        if hit >= 3:
            scored.append((hit / len(b) ** 0.5, {"content": r["content"], **r["document"]}))  # 짧고 딱 맞는 문단이 위로
    return [r for _, r in sorted(scored, key=lambda x: -x[0])[:k]]


async def _calendar_event(request: Request, asked: str) -> dict | None:
    """질문과 비슷한 앞으로의 학사일정. "언제" 질문은 낱말 하나("수강신청 언제야?" → 수강)만 겹쳐도 찾음."""
    events = await database_rows(request, "GET", "academic_calendar", params={
        "select": "title,start_date,end_date", "end_date": f"gte.{_today().isoformat()}", "limit": 200})
    def grams(s):
        return _bigrams(COMMON.sub(" ", s))
    q = grams(asked)  # 맥락 제목이 아니라 학생이 실제로 물은 말로
    best = max(events, key=lambda e: len(q & grams(e["title"])), default=None)
    hit = len(q & grams(best["title"])) if best else 0
    return best if hit >= 2 or (hit and WHEN.search(asked)) else None


def _ko_date(iso: str) -> str:
    y, m, d = iso[:10].split("-")
    return f"{int(y)}년 {int(m)}월 {int(d)}일"


def _today() -> date:
    return datetime.now(KST).date()


def _kst(iso: str) -> datetime:
    """DB의 마감은 UTC로 옴: 앞 글자를 그대로 쓰면 23:59 마감이 14:59로 보임."""
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(KST)


def _deadline_note(iso: str | None) -> str:
    """마감 상태는 코드가 정함: 빈 칸은 대개 '마감이 첨부에 있어 못 읽음'이지 '마감이 없음'이 아님."""
    if not iso:
        return NO_DEADLINE
    d = _kst(iso)
    return f"마감 {_ko_date(d.date().isoformat())} {d:%H:%M}, " + ("이미 지남" if d < datetime.now(KST) else "아직 안 지남")


async def _week_events(request: Request, p: dict, label: str) -> dict:
    """이번·다음 주(월~일, 한국 시간)와 겹치는 일정 전부. 비슷한 제목 한 건을 고르는 _calendar_event와 달리 AI 없이 코드가 답함."""
    today = _today()
    monday = today - timedelta(days=today.weekday()) + timedelta(weeks=label == "다음")
    sunday = (monday + timedelta(days=6)).isoformat()
    rows = await database_rows(request, "GET", "academic_calendar", params={
        "select": "title,start_date,end_date,target_grades", "end_date": f"gte.{monday.isoformat()}",
        "start_date": f"lte.{sunday}", "order": "start_date.asc", "limit": 200})
    rows = [r for r in rows if r["end_date"] >= monday.isoformat() and r["start_date"] <= sunday and calendar_applies(r, p)]
    span = f"{label} 주({_ko_date(monday.isoformat())} 월요일 ~ {_ko_date(sunday)} 일요일)"
    if not rows:  # 저장 자료 범위의 문제일 수 있어 "일정이 없다"고 단정하지 않음
        return {"text": f"{span} 학사일정은 제가 가진 자료에서 확인되지 않았어요. 학교 일정이 아예 없다는 뜻은 아니에요.", "cards": [], "actions": []}
    lines = [_event_chunk(r)["content"].removeprefix("[학사일정] ") for r in rows]
    return {"text": f"{span} 학사일정이에요.\n" + "\n".join(f"· {line}" for line in lines),
            "cards": [], "sources": [{"title": "학사일정", "url": None}], "actions": []}


def _event_chunk(e: dict) -> dict:
    """학사일정을 AI 근거 문단으로. 날짜는 "2027년 2월 15일"로: "02"로 쓰면 AI가 쓴 "2월"이 근거에 없는 숫자로 걸림."""
    start, end = e.get("start_date") or e["end_date"], e["end_date"]
    when = _ko_date(start) + ("" if start == end else f" ~ {_ko_date(end)}")
    return {"content": f"[학사일정] {e['title']}: {when}", "title": "학사일정", "url": None}


def _clarify(text: str) -> dict | None:
    """⑩ 주제 낱말만 물으면 무엇이 궁금한지 되묻고 고를 질문을 버튼(ask)으로. 버튼을 누르면 앱이 그 질문을 보냄."""
    topic = VAGUE_TAIL.sub("", text.strip())
    if topic not in CLARIFY:
        return None
    return {"text": f"{topic}에 대해 어떤 게 궁금하세요? 아래에서 골라 주시거나 조금 더 자세히 물어봐 주세요.",
            "cards": [], "actions": [{"type": "ask", "label": label, "payload": {"text": q}} for label, q in CLARIFY[topic]]}


MAX_CARDS = 3
# shortcut: 앱이 학생 거주지를 몰라서 제목 낱말로 지역 공지를 거름. 프로필에 지역이 생기면 그걸로 대조하기
REGIONAL = re.compile(r"(?<![가-힣])(?!수시|정시|임시|교시|즉시|동시|전시|연구|해군|육군|공군|학군)[가-힣]{1,4}(?:시|군|구)(?=\s)"
                      r"|경기도|강원|충청|전라|전북|전남|경상|경북|경남|제주|지역\s*(?:출신|인재)")


def _pick_scholarships(rows: list[dict], today: str, residence: str | None = None) -> tuple[list[dict], int]:
    """채팅 카드 후보: 안 지난·미신청·미충족 아닌 것을 신청 가능 먼저, 마감 순으로. 내 지역이 아닌 지역 공지는 빼고 개수만 돌려줌."""
    live = [r for r in rows if r["verdict"] != "ineligible" and not r["applied"] and (not r["deadline"] or _kst(r["deadline"]).date().isoformat() >= today)]
    picked = [r for r in live if not (m := REGIONAL.search(r["title"])) or m.group(0) in (residence or "")]
    picked.sort(key=lambda r: (r["verdict"] != "eligible", r["deadline"] or "9999"))
    return picked, len(live) - len(picked)


def _ask_back(p: dict, rows: list[dict], regional: int) -> str | None:
    """장학금 판정을 더 정확히 할 수 있는 정보 하나를 되묻는 문장. 한 번에 하나만."""
    reasons = " ".join(s for r in rows for s in r["reasons"])
    if "소득분위" in reasons and p.get("income_bracket") is None:
        return ASKS["income_bracket"]
    if re.search("토익|TOEIC", reasons, re.I) and p.get("toeic_score") is None:
        return ASKS["toeic_score"]
    return ASKS["residence"] if regional and not p.get("residence") else None


def _confirm_save(updates: dict) -> dict:
    """학생 말에서 찾은 값은 바로 저장하지 않고 버튼으로 확인 (잘못 알아들으면 판정·알림이 조용히 바뀜)."""
    return {"text": f"{describe(updates)}(으)로 저장할까요? 저장하면 장학금과 할 일을 다시 계산해요.", "cards": [],
            "actions": [{"type": "save_profile", "label": "저장하기", "payload": updates}]}


async def _my_info(request: Request, user: AuthenticatedUser, p: dict, topic: str | None) -> dict:
    """⑫ 내 상황 답변: 서버가 계산한 결과로 문장·카드·버튼·출처를 코드가 만듦.
    AI에게 다듬게 하면 '마감 없음'을 "마감일이 지나지 않았으니"로, '확인 필요'를 "신청 가능"으로 바꿈(10/31 실측)."""
    cards = []
    if topic == "graduation":
        try:
            g = await graduation_result(request, user)
        except APIError as e:  # 학과 기준 없음·부전공 등: 이유를 그대로 안내하고, 답 못 한 질문으로 기록
            if e.code == "PROFILE_INCOMPLETE":  # 학생이 채우면 답할 수 있으니 되묻기
                return {"text": f"{e.message} 지금 입력해 주시면 바로 계산해 드릴게요.", "cards": [],
                        "actions": [{"type": "open_screen", "label": "학적 정보 입력", "payload": {"screen": "M-4"}}]}
            return {"text": e.message, "cards": [], "actions": [], "unknown": True}
        pending = [r["name"] for r in g["requirements"] if r["done"] is not True]
        # AI 없이 코드가 씀: AI에게 맡기면 요건 목록에서 문장이 잘리고 "남은 학점을 이수하면 졸업할 수 있어요"로 단정함(10/31 실측)
        if g["remaining_total"] is None:
            lines = ["적용 졸업 기준이나 학점 인정에 확인할 사항이 있어 남은 학점을 확정할 수 없어요."]
        else:
            lines = [f"졸업까지 {g['remaining_total']:g}학점 더 들어야 해요." if g["remaining_total"] else "졸업에 필요한 총 학점은 다 채웠어요.",
                     f"· 지금 {g['earned_total']:g}학점 / 필요 {g['required_total']:g}학점"]
            cards = [{"image_url": None, "title": "졸업까지 남은 학점",
                      "lines": [f"{g['remaining_total']:g}학점", f"{g['earned_total']:g} / {g['required_total']:g}"], "link": None}]
        if pending:
            lines.append(f"· 학점 외에 확인할 요건 {len(pending)}가지가 더 있어요")
        lines.append("· 최종 졸업 여부는 서경포탈과 학과에서 확인해 주세요")
        return {"text": "\n".join(lines), "cards": cards,
                "sources": [{"title": f"{p['department']} 졸업요건", "url": None}, {"title": "내 성적·시간표", "url": None}],
                "actions": [{"type": "open_screen", "label": "졸업 요건 자세히", "payload": {"screen": "L-2"}}]}
    if topic == "scholarship":
        rows, regional = _pick_scholarships(await scholarship_rows(request, user), _today().isoformat(), p.get("residence"))
        summary = f"신청할 수 있거나 확인이 필요한 장학금이 {len(rows)}개 있어요." if rows else "지금 바로 추천할 장학금이 없어요."
        if len(rows) > MAX_CARDS:
            summary += f" 신청 가능한 것과 마감이 가까운 것부터 {MAX_CARDS}개만 보여 드릴게요."
        if regional:
            summary += f" 특정 지역 대상 장학금 {regional}개는 '나에게 맞는 장학금'에서 볼 수 있어요."
        cards = [{"image_url": None, "title": r["title"],
                  "lines": [VERDICT_KO[r["verdict"]], f"마감 {_kst(r['deadline']).date()}" if r["deadline"] else NO_DEADLINE],
                  "link": r["url"]} for r in rows[:MAX_CARDS]]
        actions = [{"type": "open_screen", "label": "나에게 맞는 장학금", "payload": {"screen": "S-1"}}]
        more = _ask_back(p, rows, regional)
        if any("성적 미입력" in s for r in rows for s in r["reasons"]):
            actions.append({"type": "open_screen", "label": "직전 학기 성적 입력", "payload": {"screen": "L-8"}})
        # 되묻는 문장은 코드가 붙임: 다음 답이 무엇에 대한 것인지 이 문장으로 알아봄(asked_field)
        return {"text": f"{summary}\n\n{more}" if more else summary, "cards": cards, "actions": actions,
                "sources": [{"title": r["title"], "url": r["url"]} for r in rows[:MAX_CARDS]]}
    rows = await database_rows(request, "GET", "todos", params={
        "user_id": f"eq.{user.id}", "done": "eq.false", "or": f"(due_date.gte.{_today().isoformat()},due_date.is.null)",
        "select": "title,due_date,source_id", "order": "priority.desc,due_date.asc.nullslast", "limit": 3})
    ids = ",".join(str(r["source_id"]) for r in rows if r["source_id"])
    notices = await database_rows(request, "GET", "notices", params={"id": f"in.({ids})", "select": "title,url"}) if ids else []
    def due(r):  # 직접 만든 할 일은 정말 마감이 없을 수 있지만, 공지에서 온 것은 마감을 못 읽은 것
        return f"{_ko_date(r['due_date'])}까지" if r["due_date"] else NO_DEADLINE if r["source_id"] else "마감 없음"
    text = "\n".join(["챙길 일이에요."] + [f"· {r['title']}: {due(r)}" for r in rows]) if rows else "지금 챙길 일이 없어요."
    return {"text": text, "cards": cards, "sources": [{"title": n["title"], "url": n["url"]} for n in notices],
            "actions": [{"type": "open_screen", "label": "할 일 전체 보기", "payload": {"screen": "T-1"}}]}


def _notice_chunk(n: dict) -> dict:
    """공지·공지에서 온 할 일에서 넘어온 질문은 그 공지 원문을 첫 근거로 (학교 문서에는 공지 내용이 없음)."""
    head = f"[공지] {n['title']} ({_deadline_note(n['deadline'])})"
    return {"content": f"{head}\n{(n['body'] or '')[:1500]}", "title": n["title"], "url": n["url"],
            "expired": bool(n["deadline"]) and _kst(n["deadline"]) < datetime.now(KST)}


# 공지 제목을 찾을 때 뺄 말: 어느 공지인지 가르지 못함. 앞부분만 봐서 조사·어미는 따로 안 뗌
NOTICE_STOP = re.compile(r"장학|공지|안내|신청|접수|마감|기한|기간|언제|며칠|날짜|일정|조건|자격|대상|서류|방법|절차|어떻게|알려|설명|궁금|"
                         r"이번|다음|올해|지났|끝났|남았|받을|지원|선발|모집")
# 통째로 이 말일 때만 뺌: "학점포기", "국가장학금"처럼 공지 이름의 일부일 수 있음
NOTICE_STOP_WORD = re.compile(r"(휴학|복학|졸업|수강|수강신청|계절학기|성적|학점|등록금?|학기|학년|학교|서경대|서경대학교|우리|있어|있나|있나요|돼|되나|되나요|해야|하면|그거|이거|저거|어디)(은|는|이|가|을|를|의|에)?")
NOTICE_LIST = re.compile(r"공지.{0,10}(뭐|있|알려|보여)|(최근|요즘|새로운?|오늘)\s*(올라온\s*)?공지|마감\s*(임박|가까|곧)|곧\s*마감")
NOTICE_MATCH = 0.6  # 질문의 이름 낱말 중 이만큼이 제목에 있어야 함: "아직", "내야" 같은 말이 섞여도 찾게


def _pick_notice(rows: list[dict], text: str) -> dict | None:
    """제목이 질문의 이름 낱말("대산농촌재단")과 가장 많이 겹치는 공지. 공지에는 임베딩이 없어 글자로 찾음. 같으면 앞(최신) 공지."""
    q = set().union(*(_bigrams(w) for w in re.findall("[가-힣A-Za-z]+", text) if not NOTICE_STOP.match(w) and not NOTICE_STOP_WORD.fullmatch(w)))
    if not q:
        return None
    best = max(rows, key=lambda r: len(q & _bigrams(r["title"])), default=None)
    hit = len(q & _bigrams(best["title"])) if best else 0
    return best if hit >= 2 and hit / len(q) >= NOTICE_MATCH else None  # 2개 이상: "전과" 하나로 "전과 발표 안내"가 걸리지 않게


async def _named_notice(request: Request, question: str) -> dict | None:
    """대화에서 이름으로 물은 공지의 근거 문단. 이번 질문으로 못 찾으면 "그럼 서류는?"처럼 앞 질문의 공지."""
    rows = await database_rows(request, "GET", "notices", params={
        "select": "id,title", "extraction_status": "eq.ready", "order": "posted_at.desc,id.desc", "limit": 500})
    prev = re.search(r"\[이전 질문\] (.+)", question)
    hit = _pick_notice(rows, question.rsplit("질문:", 1)[-1]) or (prev and _pick_notice(rows, prev[1]))
    if not hit:
        return None
    return _notice_chunk((await database_rows(request, "GET", "notices", params={"id": f"eq.{hit['id']}", "select": NOTICE_COLS}))[0])


async def _open_notices(request: Request) -> dict:
    """"공지 뭐 있어?": 마감이 남은 공지를 가까운 순으로. 마감을 모르는 공지는 지났을 수 있어 뺌. AI 없이 코드가 답함."""
    rows = await database_rows(request, "GET", "notices", params={
        "select": "title,url,deadline,target", "extraction_status": "eq.ready", "deadline": f"gte.{datetime.now(KST).isoformat()}",
        "order": "deadline.asc", "limit": 50})
    rows = [r for r in rows if "staff" not in ((r["target"] or {}).get("statuses") or [])][:5]  # 교직원 대상 공지 제외
    if not rows:
        return {"text": "마감이 남은 공지가 지금은 없어요.", "cards": [], "actions": []}
    lines = [f"· {r['title']}: {_ko_date(_kst(r['deadline']).date().isoformat())}까지" for r in rows]
    return {"text": "\n".join(["마감이 남은 공지를 가까운 순으로 보여 드릴게요."] + lines), "cards": [], "actions": [],
            "sources": [{"title": r["title"], "url": r["url"]} for r in rows]}


def _used(answer: str, chunks: list[dict]) -> list[dict]:
    """출처는 답과 글자가 많이 겹치는 문단만 (AI가 쓰지 않은 문단의 문서까지 보여 주지 않게)."""
    a = _bigrams(answer)
    hits = [len(a & _bigrams(c["content"])) for c in chunks]
    return [c for c, h in zip(chunks, hits) if h >= max(hits) / 2]


async def _from_docs(request: Request, question: str, p: dict, extra: list[dict]) -> dict:
    """⑪ 문서 근거 답변. 근거가 없으면 지어내지 않고 '모른다'."""
    # 지금 질문만으로 먼저 찾고, 못 찾을 때만 앞 대화·맥락을 붙여 다시 (앞 주제 문단이 새 질문을 덮지 않게)
    asked = question.rsplit("질문:", 1)[-1]
    event = await _calendar_event(request, asked)
    if event and WHEN.search(asked):  # "수강신청 언제야?": 요람엔 날짜가 없어서 학사일정 표의 실제 날짜를 근거로
        extra = extra + [_event_chunk(event)]
    k = 1 if any(c.get("url") for c in extra) else 3  # 공지 원문이 길어 모델 컨텍스트(4096)에 문서 3개까지 못 들어감
    chunks = extra + (await search_chunks(request, asked, k, p) or (asked != question and await search_chunks(request, question, k, p)) or [])
    if not chunks:  # '질문 대상이 문서에 없어 버림'과 구분
        log.info("검색 결과 없음: %s", asked[:30])
    # 복학은 휴학생에게만 학적을 넘김: 넘기면 재학생에게도 "재학 중이시니 복학원을 내 주세요"로 권함(10/31 실측)
    student = {"학적": STATUS_KO.get(p["status"], p["status"])} if PERSONAL.search(asked) and (p["status"] == "leave" or "복학" not in asked) else {}
    if BY_DEPT.search(asked):
        student |= {"학과": p["department"], "입학년도": p["admission_year"], "학년": p["grade"]}
    answer = await run_in_threadpool(tasks.answer_from_docs, question, chunks, student)
    if not answer:
        # 공지는 찾았는데 내용이 첨부에만 있는 경우: "자료에 없다"가 아니라 원문으로 안내. 자료 보강 대상이 아니라 기록 안 함
        if notice := next((c for c in extra if "expired" in c), None):
            head = notice["content"].split("\n")[0].removeprefix("[공지] ")
            return {"text": f"{head} 공지를 찾았지만, 물어보신 내용은 공지 글에서 확인하지 못했어요. 첨부에 있을 수 있으니 원문을 확인해 주세요.",
                    "cards": [], "sources": [{"title": notice["title"], "url": notice["url"]}], "actions": []}
        school = SCHOOL.search(asked)
        return {"text": UNKNOWN if school else OFF_TOPIC, "cards": [], "sources": [], "actions": [], "unknown": bool(school)}
    used = _used(answer, chunks)
    sources = list({c["title"]: {"title": c["title"], "url": c["url"]} for c in used}.values())
    if any(c.get("expired") for c in used):  # 지난 공지를 AI가 신청하라고 안내해도 학생이 먼저 보게 코드가 붙임
        answer = f"이 공지는 마감이 지났어요.\n{answer}"
    # ⑬ 다음 행동 버튼 (규칙): 질문과 비슷한 학사일정이 앞으로 있으면 '마감 알림 받기'
    actions = [{"type": "add_todo", "label": "마감 알림 받기",
                "payload": {"title": event["title"], "due_date": event["end_date"]}}] if event else []
    if actions:  # 버튼 안내는 코드가 씀 (AI에게 맡기면 없는 버튼을 말할 수 있음)
        answer += "\n아래 버튼으로 마감 알림을 받아 둘 수 있어요."
    return {"text": answer, "cards": [], "sources": sources, "actions": actions}


class Context(BaseModel):
    kind: Literal["todo", "notice", "status"]  # status: A-3 휴·복학 화면에서 (id는 안 씀, 앱은 0)
    id: int


class ChatIn(BaseModel):
    conversation_id: int | None = None
    text: str = Field(min_length=1, max_length=500)
    context: Context | None = None


MAX_PARTS = 3  # 질문마다 AI를 따로 불러서(GPU에서 개당 약 10초) 한 번에 3개까지
NUM = "①②③"


async def _answer(request: Request, user: AuthenticatedUser, p: dict, question: str, extra: list[dict]) -> dict:
    """질문 하나에 대한 답: ⑩ 의도 파악 → 위기·인사 / ⑫ 내 정보 / ⑪ 문서."""
    route = await run_in_threadpool(tasks.route_question, question)
    if route["intent"] == "crisis":
        return {"text": CRISIS, "cards": [], "actions": []}
    if route["intent"] == "smalltalk":
        text = ("도움이 됐다니 다행이에요. 또 궁금한 게 있으면 언제든 물어봐 주세요." if route["topic"] == "thanks"
                else f"안녕하세요, {p['nickname']}님! 저는 PREVI예요. {CAN_DO}")  # 이름은 첫인사에서만 부름
        return {"text": text, "cards": [], "actions": []}
    asked = question.rsplit("질문:", 1)[-1]
    if (week := WEEK.search(asked)) and WEEK_TOPIC.search(asked):
        return await _week_events(request, p, week[1])
    # 내 정보보다 먼저: "나 대산농촌재단 장학금 받을 수 있어?"에 장학금 전체 목록으로 답하지 않게
    if not extra and (named := await _named_notice(request, question)):
        return await _from_docs(request, question, p, [named])
    if not extra and NOTICE_LIST.search(asked):
        return await _open_notices(request)
    if route["intent"] == "my_info":
        return await _my_info(request, user, p, route["topic"])
    return await _from_docs(request, question, p, extra)


async def _one(request: Request, table: str, **params) -> dict | None:
    rows = await database_rows(request, "GET", table, params={**params, "limit": 1})
    return rows[0] if rows else None


@router.post("/chat")
async def chat(body: ChatIn, request: Request, user: AuthenticatedUser = Depends(require_user)):
    p = await _one(request, "profiles", user_id=f"eq.{user.id}", select="*")
    if not p:
        raise APIError(404, "PROFILE_NOT_FOUND", "처음 설정이 필요해요.")
    ret = {"Prefer": "return=representation"}
    last = asked = None
    if body.conversation_id:
        conv = await _one(request, "conversations", id=f"eq.{body.conversation_id}", user_id=f"eq.{user.id}", select="id")
        if not conv:
            raise APIError(404, "NOT_FOUND", "대화를 찾을 수 없어요.")
        # 직전 질문: "그럼 복학은?"처럼 앞 말을 생략한 질문을 이해하게.
        # 앞 답은 넘기지 않음: 넘기면 주제가 바뀐 질문에도 AI가 앞 답을 그대로 베낌(10/29 실측)
        last = await _one(request, "messages", conversation_id=f"eq.{conv['id']}", role="eq.user", select="text", order="id.desc")
        before = await _one(request, "messages", conversation_id=f"eq.{conv['id']}", role="eq.assistant", select="text", order="id.desc")
        asked = asked_field(before and before["text"])
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
            lines.append(f"[{ctx['title']}] {shown_reason(ctx['reason']) or ''}")
    def ask(text):
        return "\n".join(lines + [f"질문: {text}"]) if lines else text
    extra = [_notice_chunk(notice)] if notice else []

    # 여러 가지를 한 번에 물으면 하나씩 따로 찾고 답함: 통째로 찾으면 첫 주제 문단만 걸렸음(10/29)
    updates = profile_updates(body.text, asked)
    parts = [] if updates else await run_in_threadpool(tasks.split_questions, body.text)
    if updates:
        reply = _confirm_save(updates)
    elif len(parts) == 1:  # 할 일·공지 맥락이 있으면 주제가 정해져 있어 되묻지 않음. 앞 질문은 안 봄: "휴학 알려줘"도 6글자라 앞 질문이 붙어 되묻기가 빠졌음(11/1 실측)
        reply = (not body.context and _clarify(body.text)) or await _answer(request, user, p, ask(body.text), extra)
    else:
        replies = [await _answer(request, user, p, ask(q), extra) for q in parts[:MAX_PARTS]]
        text = "\n\n".join(f"{NUM[i]} {q}\n{r['text']}" for i, (q, r) in enumerate(zip(parts, replies)))
        if len(parts) > MAX_PARTS:
            text += f"\n\n나머지 {len(parts) - MAX_PARTS}개 질문은 하나씩 다시 물어봐 주세요."
        reply = {"text": text, "cards": [c for r in replies for c in r["cards"]],
                 "sources": list({s["title"]: s for r in replies for s in r.get("sources", [])}.values()),
                 "actions": [a for r in replies for a in r["actions"]], "unknown": any(r.get("unknown") for r in replies)}

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


class FeedbackIn(BaseModel):
    feedback: Literal["up", "down"] | None


@router.patch("/messages/{message_id}/feedback")
async def message_feedback(message_id: int, body: FeedbackIn, request: Request, user: AuthenticatedUser = Depends(require_user)):
    """👍👎 (관리자 '아쉬워요'). 자기 대화인지는 RLS(messages_own)가 확인."""
    rows = await database_rows(request, "PATCH", "messages", headers={"Prefer": "return=representation"},
                               params={"id": f"eq.{message_id}", "role": "eq.assistant", "select": "id,feedback"},
                               json={"feedback": body.feedback})
    if not rows:
        raise APIError(404, "NOT_FOUND", "메시지를 찾을 수 없어요.")
    return rows[0]


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
