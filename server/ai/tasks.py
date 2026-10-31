"""비서가 AI에게 시키는 일 모음 (AI 작업 플로우 번호). 다른 파일은 이 함수들만 부릅니다.
AI가 실패해도 서비스가 멈추지 않게, 함수마다 문장 틀(템플릿)로 대신하는 길이 있습니다."""
import json
import logging
import re

from server.ai.client import ask_json
from server.logic.schedule import DEFAULT_SEVERITY

log = logging.getLogger("ai")


def _ask(prompt: str, payload: dict, *, strict=False) -> dict | None:
    try:
        return ask_json(prompt, json.dumps(payload, ensure_ascii=False, default=str))
    except Exception as e:  # AiError, 연결 실패 등. AI 서버가 꺼져 있어도 템플릿으로 계속 감
        if strict:
            raise
        log.warning("AI %s 실패: %s", prompt, e)
        return None


DEPARTMENTS = ["소프트웨어학과", "전자컴퓨터공학과"]  # routes/me.py에서 고를 수 있는 학과와 같게
PROCEDURE_WORDS = ("이중수혜", "문의", "접수", "제출", "면접", "방문", "첨부파일 참고",  # 자격이 아니라 신청 절차
                   "포털", "홈페이지", "에서 신청", "로 신청", "신청 방법", "신청기간", "신청 기간", "우편", "메일", "마감",
                   "재수강", "철회", "정정할 수 없", "본인이 반드시")  # 유의사항: 자격이 아님 (학점포기 공지, 10/29)
# 학생이 신청할 게 아닌 공지. "교원자격"·"교직이수"는 학생 공지라 '교원'·'교직' 낱말 하나로는 거르지 않음
NOT_FOR_STUDENTS = re.compile(r"폐강|교직원|(교수|교원|강사|직원)\s*(초빙|채용|모집|대상|공모)")
STATUS = {"enrolled": "enrolled", "leave": "leave", "returned": "returned", "재학생": "enrolled", "휴학생": "leave", "복학생": "returned"}


def summarize_notice(title: str, body: str, *, strict=False) -> dict:
    """① 공지 해석 + ② 대상 분류. 실패하면 요약 없이 원문만 둠 (빈 조건 = 모두 대상)."""
    payload = {"title": title, "body": body}
    out = (_ask("notice_summary", payload, strict=True) if strict else _ask("notice_summary", payload)) or {}
    if strict and (not isinstance(out, dict) or not isinstance(out.get("summary"), list) or not out["summary"]):
        raise ValueError("공지 해석 결과가 비어 있습니다.")
    target, conditions = clean_target(out.get("target")), clean_conditions(out.get("conditions"))
    # 학과 칸에 "신입생"·"○○군 출신"이 오면 우리 학생이 모두 '조건 미충족'으로 잘못 뜸 → '확인 필요'로
    odd = [d for d in target["departments"] if not d.endswith(("학과", "학부", "전공"))]
    if odd:
        target["departments"] = [d for d in target["departments"] if d not in odd]
        conditions["unknown"] = conditions.get("unknown", []) + odd
    # AI가 "총 평점 3.5", "1학년(33학점) 수료"를 직전 학기 칸에도 넣는 일이 잦음: 같은 숫자가 '직전' 없는 문장에 있으면 칸에서 뺌
    sentences = [s for s in conditions.get("unknown", []) if "직전" not in s]
    for key in ("min_gpa", "min_credits"):
        v = conditions.get(key)
        if v is not None and any(re.search(rf"(?<![\d.]){re.escape(n)}(?!\.?\d)", s) for n in {f"{v:g}", f"{v:.1f}"} for s in sentences):
            del conditions[key]
    category = out.get("category") or "일반"
    # 장학인데 대상·조건이 하나도 없으면 대개 자격이 첨부에만 있는 공지 → '신청 가능'으로 띄우지 않음
    if (category == "장학" or "장학" in title) and not target["grades"] and not target["departments"] and not conditions:
        conditions["unknown"] = ["자격 조건은 첨부 공고문 확인"]
    # 교수 대상·폐강 안내는 학생 판정에서 뺌: 어떤 학생 학적과도 안 맞는 'staff'로 두면 '조건 미충족'이 되어 맞춤 공지·할 일·알림에 안 뜸
    if NOT_FOR_STUDENTS.search(title) or any(NOT_FOR_STUDENTS.search(s) for s in conditions.get("unknown", [])):
        target, conditions = {"grades": [], "departments": [], "statuses": ["staff"]}, {}
    return {
        "category": category,
        "summary": (out.get("summary") or [title])[:3],
        "deadline": out.get("deadline"),
        "documents": out.get("documents") or [],
        "target": target,
        "conditions": conditions,
    }


def clean_target(t) -> dict:
    """AI가 쓴 대상을 BE A 대조 코드가 읽는 모양으로. 학과는 짧게 써도('소프트웨어') 정식 이름으로 맞춤."""
    t = t if isinstance(t, dict) else {}
    grades = [int(g) for g in t.get("grades") or [] if str(g).strip() in ("1", "2", "3", "4")]
    grades = [] if set(grades) == {1, 2, 3, 4} else grades  # 전 학년 = 제한 없음 (이유 문장에 학년 줄이 안 생기게)
    depts = [next((k for k in DEPARTMENTS if d in k or k in d), d)
             for d in (str(x).strip() for x in t.get("departments") or []) if d]
    statuses = [STATUS[s] for s in t.get("statuses") or [] if s in STATUS]
    return {"grades": grades, "departments": depts, "statuses": statuses}


def clean_conditions(c) -> dict:
    """숫자가 아니면 버림. 글자("3.0")가 그대로 가면 대조 코드의 >= 비교에서 서버가 멈춤."""
    c = c if isinstance(c, dict) else {}
    out = {}
    for key, cast in (("min_gpa", float), ("min_credits", int), ("income_max", int)):
        try:
            if c.get(key) is not None and float(c[key]) > 0:  # 0은 AI가 '없음' 대신 쓴 값
                out[key] = cast(float(c[key]))
        except (TypeError, ValueError):
            log.warning("공지 조건 %s 무시: %r", key, c[key])
    # 칸에 못 넣은 조건: 판정 코드가 보고 '확인 필요'로 돌림 (조용히 버리면 '신청 가능'으로 잘못 뜸)
    # shortcut: 신청 절차 문장은 낱말로 거름. 진짜 자격 조건이 걸러지는 일이 보이면 지시문 쪽에서 고치기
    unknown = [s for s in (str(u).strip() for u in c.get("unknown") or [] if u)
               if s and not any(w in s for w in PROCEDURE_WORDS)]
    if unknown:
        out["unknown"] = unknown
    return out


def severity(todo_type: str, title: str) -> int:
    """④ 놓쳤을 때 피해 크기 1~3."""
    out = _ask("severity", {"type": todo_type, "title": title}) or {}
    s = out.get("severity")
    return s if s in (1, 2, 3) else DEFAULT_SEVERITY[todo_type]


# shortcut: 프로세스가 켜져 있는 동안 계속 쌓임. 밤 작업은 실행마다 새로 시작하니 괜찮고, 상시 서버에서 부르게 되면 크기 제한 두기
_REASONS: dict[tuple, str] = {}


def explain_reason(title: str, verdict: str, reasons: list[str]) -> str:
    """⑥ '왜 나에게 해당하는지' 한두 문장. 공지·판정·근거가 같은 학생끼리는 AI 문장을 나눠 씀."""
    key = (title, verdict, tuple(reasons))
    if key not in _REASONS:
        text = (_ask("reason", {"title": title, "verdict": verdict, "reasons": reasons}) or {}).get("text")
        if not text:  # AI 실패는 저장하지 않음: 다음 학생 때 다시 시도
            return " · ".join(reasons)
        _REASONS[key] = text
    return _REASONS[key]


MINE = re.compile(r"(?<![가-힣])(나|내|저|제(?!\s*\d+\s*조)(?!도))(가|는|도|의|한테)?(?![가-힣])|남았|남은")  # "제 30조"·"제도"의 제는 내가 아님
TOPICS = (("graduation", re.compile("졸업|학점")), ("scholarship", re.compile("장학")), ("todo", re.compile("할 일|마감")))
RULE_WORDS = re.compile("조건|방법|어떻게|언제|기간|절차|서류|최대|몇 학점까지")
# 학과를 안 말한 졸업 요건·학점은 학과마다 답이 달라 학생 기준으로 계산한 결과로 답함 (문서로 가면 다른 전공 요건을 답함, 10/31 실측)
GRAD_OWN = re.compile(r"졸업\s*(요건|(총\s*)?학점)(이|은|는|을|좀)?\s*(뭐|몇|어떻게|알려|얼마|$)")
NAMED_MAJOR = re.compile("학과|학부|전공")


def _route_by_rule(q: str) -> dict | None:
    """뻔한 질문은 AI 없이 분류 (AI 분류 약 5초 절약). 애매하면 None → AI가 분류."""
    if GRAD_OWN.search(q) and not NAMED_MAJOR.search(q):
        return {"intent": "my_info", "topic": "graduation"}
    mine, rule = MINE.search(q), RULE_WORDS.search(q)
    topic = next((t for t, p in TOPICS if p.search(q)), None)
    if mine and topic and not rule:
        return {"intent": "my_info", "topic": topic}
    if not mine and (rule or re.search("뭐야|뭔가요|이란", q)):
        return {"intent": "document", "topic": None}
    return None


CRISIS = re.compile(r"죽고\s*싶|자살|자해|살기\s*싫|사라지고\s*싶|극단적\s*선택|목숨을?\s*끊")
# 위기 낱말이 없는 힘든 마음. 짧은 말일 때만 (긴 문장은 "수강신청 힘들어"처럼 학사 질문인 경우가 많음).
# 상담 안내를 받는 쪽으로 틀리는 게 "도와드리기 어려운 질문"이라고 답하는 것보다 나음
DISTRESS = re.compile("힘들어|힘들다|우울|외로워|불안해|지쳤어|버티기")
THANKS = re.compile("고마워|고맙|감사|땡큐|ㄱㅅ")
HELLO = re.compile(r"^(안녕|하이|ㅎㅇ|반가워|hi|hello)|(넌|너는|너)\s*누구|뭐\s*할\s*수\s*있|뭘\s*도와|도움말", re.I)


def route_question(text: str) -> dict:
    """⑩ 의도 파악: {"intent": "my_info" | "document" | "crisis" | "smalltalk", "topic": ...}
    crisis(힘든 마음)·smalltalk(인사·감사)는 코드로 바로 답함. AI 판단에 맡기지 않음."""
    asked = text.rsplit("질문:", 1)[-1].strip()  # 할 일·공지에서 넘어온 질문은 "질문:" 뒤만 봄
    if CRISIS.search(asked) or (len(asked) <= 20 and DISTRESS.search(asked)):
        return {"intent": "crisis", "topic": None}
    if len(asked) <= 15 and (THANKS.search(asked) or HELLO.search(asked)):  # "안녕, 휴학 언제야?"처럼 긴 건 보통 질문으로
        return {"intent": "smalltalk", "topic": "thanks" if THANKS.search(asked) else "hello"}
    if hit := _route_by_rule(asked):
        return hit
    out = _ask("chat_router", {"question": text}) or {}
    # 내 정보인데 주제가 셋 밖(성적·시간표 등)이면 할 일 목록으로 엉뚱하게 답하게 되니 문서 검색으로
    if out.get("intent") != "my_info" or out.get("topic") not in ("graduation", "scholarship", "todo"):
        return {"intent": "document", "topic": None}
    return {"intent": "my_info", "topic": out["topic"]}


SPLIT = re.compile(r"[?？\n]+|\s*[,，]\s*|\s+(?:그리고|또한|또)\s+")
LISTED = re.compile(r"\S(?:이)?랑\s")  # "휴학이랑 복학 알려줘": 기호 없이 묶은 질문


def split_questions(text: str) -> list[str]:
    """⑩ 한 메시지에 여러 가지를 물으면 하나씩 나눔. 하나뿐이면 [text].
    여럿으로 보일 때만 AI에게 나누게 하고(생략된 말 채움), AI가 실패하면 기호로 나눈 결과."""
    parts = [p.strip() for p in SPLIT.split(text) if len(p.strip()) >= 2]
    if len(parts) < 2 and not LISTED.search(text):
        return [text]
    out = (_ask("split_questions", {"question": text}) or {}).get("questions")
    if isinstance(out, list) and out and all(isinstance(q, str) and q.strip() for q in out):
        return [q.strip() for q in out]
    return parts if len(parts) >= 2 else [text]


NO_ANSWER = re.compile(r"명시되어\s*있지\s*않|나와\s*있지\s*않|적혀\s*있지\s*않|문서에\s*(없|는\s*없)|확인할\s*수\s*없|알\s*수\s*없")
SUBJECT_GENERIC = {"제도", "신청", "절차", "방법", "기준", "조건", "기간", "규정", "안내", "서경대", "서경대학교", "학교", "우리"}
EXISTS = re.compile(r"있(어|나요|니|습니까|을까|는지)")
DENIED = re.compile(r"(?<!수 )없|않아도|안\s*봐도")  # "넘을 수 없어요"는 규정이지 '없다'는 답이 아님


def _subject_in_docs(subject, docs: list[str]) -> bool:
    """질문이 콕 집은 대상의 낱말이 문서에 모두 있는지. 대상을 안 집었으면(null) 통과. 띄어쓰기는 무시("성적 우수"="성적우수")."""
    if not isinstance(subject, str):
        return True
    text = re.sub(r"\s", "", " ".join(docs))
    words = [re.sub("(의|은|는|을|를)$", "", w) for w in subject.split()]
    return all(w in text for w in words if w and w not in SUBJECT_GENERIC)


def answer_from_docs(question: str, chunks: list[dict], student: dict | None = None) -> str | None:
    """⑪ 문서 근거 답변. 근거로 답할 수 없으면 None → '모른다' 처리."""
    if not chunks:
        return None
    docs = [c["content"] for c in chunks]
    out = _ask("chat_answer", {"question": question, "student": student or {}, "documents": docs}) or {}
    # 결론 + 요점 목록이라 문장 수는 넉넉히. 지시문을 어겨 "-"·"•"로 쓴 목록은 앱이 그리는 "· "로
    raw = out.get("answer")
    answer = _short(re.sub(r"(?m)^\s*[-•*]\s+", "· ", raw) if isinstance(raw, str) else raw, 220, sentences=4)
    if answer and NO_ANSWER.search(answer):  # 지시문으로 막아도 "문서에 명시되어 있지 않아요"를 씀: 코드의 '모른다' 문장으로
        return None
    # 없는 제도를 물어도 비슷한 문단으로 절차를 지어냄(10/31 실측): 숫자 검사로는 못 막아서 대상 이름을 대조
    if answer and not _subject_in_docs(out.get("subject"), docs):
        log.warning("질문 대상이 문서에 없어 버림: %s", out.get("subject"))
        return None
    # "졸업 시험 있어?"에 시험 조문·폐지 공지만 보고 "없어요"로 단정함(10/31 실측): 언급이 없는 것은 없다는 근거가 아님
    # shortcut: 문서가 정말 없다고 적은 경우도 '모른다'가 됨. 그런 질문이 미응답에 쌓이면 문서 문장과 대조하기
    if answer and EXISTS.search(question.rsplit("질문:", 1)[-1]) and DENIED.search(answer.split("\n")[0]):
        log.warning("없다는 단정이라 버림: %s", answer)
        return None
    # 문서·질문·학생 정보에 없는 숫자가 답에 있으면 지어낸 것으로 보고 '모른다'로
    if answer and not set(re.findall(r"\d+", answer)) <= set(re.findall(r"\d+", f"{question} {student} {' '.join(docs)}")):
        log.warning("근거에 없는 숫자라 버림: %s", answer)
        return None
    return answer or None


def answer_my_info(question: str, facts: dict) -> str:
    """⑫ 내 상황 답변. facts는 아침에 계산해 둔 결과."""
    out = _ask("my_info_answer", {"question": question, "facts": facts}) or {}
    return _short(out.get("answer"), 100) or facts.get("summary") or "내 정보를 정리했어요."


# 지시문으로 "~요"만 쓰라고 해도 Kanana가 "~합니다"를 섞음(10/30 실측): 흔한 끝말만 코드로 바꿈
FORMAL = {"합니다": "해요", "됩니다": "돼요", "있습니다": "있어요", "없습니다": "없어요", "않습니다": "않아요"}


def _polite(text: str) -> str:
    text = re.sub("(?m)(?:" + "|".join(FORMAL) + r")(?=[.!]|$)",lambda m: FORMAL[m.group()], text)
    # "입니다": 앞 글자에 받침이 있으면 "이에요"(학점이에요), 없으면 "예요"(까지예요)
    return re.sub(r"(?m)(.)입니다(?=[.!]|$)", lambda m: m[1] + ("이에요" if "가" <= m[1] <= "힣" and (ord(m[1]) - 0xAC00) % 28 else "예요"), text)


def _short(text, limit: int, sentences: int = 2):
    """지시문을 어기고 길게 쓴 답을 2문장·limit 글자 안의 마지막 문장 끝에서 자름. 문장 끝이 없으면 '…'."""
    if not isinstance(text, str):
        return text
    text = _polite(text)
    ends = [m.end() for m in re.finditer(r"[.?!](?!\S)", text)]  # "3.5"의 점은 문장 끝 아님
    if len(ends) > sentences:
        text = text[:ends[sentences - 1]]
    if len(text) <= limit:
        return text
    ends = [e for e in ends if e <= limit]
    return text[:ends[-1]] if ends else text[:limit].rstrip() + "…"
