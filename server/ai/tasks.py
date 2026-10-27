"""비서가 AI에게 시키는 일 모음 (AI 작업 플로우 번호). 다른 파일은 이 함수들만 부릅니다.
AI가 실패해도 서비스가 멈추지 않게, 함수마다 문장 틀(템플릿)로 대신하는 길이 있습니다."""
import json
import logging

from server.ai.client import ask_json
from server.logic.schedule import DEFAULT_SEVERITY

log = logging.getLogger("ai")


def _ask(prompt: str, payload: dict) -> dict | None:
    try:
        return ask_json(prompt, json.dumps(payload, ensure_ascii=False, default=str))
    except Exception as e:  # AiError, 연결 실패 등. AI 서버가 꺼져 있어도 템플릿으로 계속 감
        log.warning("AI %s 실패: %s", prompt, e)
        return None


DEPARTMENTS = ["소프트웨어학과", "전자컴퓨터공학과"]  # routes/me.py에서 고를 수 있는 학과와 같게
STATUS = {"enrolled": "enrolled", "leave": "leave", "returned": "returned", "재학생": "enrolled", "휴학생": "leave", "복학생": "returned"}


def summarize_notice(title: str, body: str) -> dict:
    """① 공지 해석 + ② 대상 분류. 실패하면 요약 없이 원문만 둠 (빈 조건 = 모두 대상)."""
    out = _ask("notice_summary", {"title": title, "body": body}) or {}
    return {
        "category": out.get("category") or "일반",
        "summary": (out.get("summary") or [title])[:3],
        "deadline": out.get("deadline"),
        "documents": out.get("documents") or [],
        "target": clean_target(out.get("target")),
        "conditions": clean_conditions(out.get("conditions")),
    }


def clean_target(t) -> dict:
    """AI가 쓴 대상을 BE A 대조 코드가 읽는 모양으로. 학과는 짧게 써도('소프트웨어') 정식 이름으로 맞춤."""
    t = t if isinstance(t, dict) else {}
    grades = [int(g) for g in t.get("grades") or [] if str(g).strip() in ("1", "2", "3", "4")]
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
            if c.get(key) is not None:
                out[key] = cast(float(c[key]))
        except (TypeError, ValueError):
            log.warning("공지 조건 %s 무시: %r", key, c[key])
    # 칸에 못 넣은 조건: 판정 코드가 보고 '확인 필요'로 돌림 (조용히 버리면 '신청 가능'으로 잘못 뜸)
    unknown = [s for s in (str(u).strip() for u in c.get("unknown") or [] if u) if s]
    if unknown:
        out["unknown"] = unknown
    return out


def severity(todo_type: str, title: str) -> int:
    """④ 놓쳤을 때 피해 크기 1~3."""
    out = _ask("severity", {"type": todo_type, "title": title}) or {}
    s = out.get("severity")
    return s if s in (1, 2, 3) else DEFAULT_SEVERITY[todo_type]


def explain_reason(title: str, verdict: str, reasons: list[str]) -> str:
    """⑥ '왜 나에게 해당하는지' 한두 문장."""
    out = _ask("reason", {"title": title, "verdict": verdict, "reasons": reasons}) or {}
    return out.get("text") or " · ".join(reasons)


def write_briefing(facts: dict) -> dict:
    """⑤ 브리핑 문장 + ⑦ 추천 질문 3개. facts는 코드가 계산한 숫자들."""
    out = _ask("briefing", facts) or {}
    text = out.get("briefing")
    questions = out.get("suggested_questions") or []
    if not text:
        parts = []
        if facts["due_today"]:
            parts.append(f"오늘 마감인 일 {facts['due_today']}개")
        if facts["eligible_scholarships"]:
            parts.append(f"신청 가능한 장학금 {facts['eligible_scholarships']}개")
        text = ", ".join(parts) + "가 있어요" if parts else "오늘은 급하게 챙길 일이 없어요"
    if len(questions) < 3:
        questions = (questions + _default_questions(facts))[:3]
    return {"briefing": text, "suggested_questions": questions[:3]}


def _default_questions(facts: dict) -> list[str]:
    by_grade = {
        1: ["수강 정정이 뭐야?", "교양 필수는 뭘 들어야 해?", "장학금 어떤 게 있어?"],
        2: ["성적우수 장학금 조건이 뭐야?", "부전공 신청은 어떻게 해?", "계절학기는 몇 학점까지 돼?"],
        3: ["휴학하면 장학금은 어떻게 돼?", "복학 신청은 언제 해?", "계절학기는 몇 학점까지 돼?"],
        4: ["졸업까지 뭐가 남았어?", "졸업작품 심사 신청은 언제까지야?", "장학금 신청 마감 언제야?"],
    }
    return by_grade.get(facts.get("grade") or 4, by_grade[4])


def route_question(text: str) -> dict:
    """⑩ 의도 파악: {"intent": "my_info" | "document", "topic": "graduation" | "scholarship" | "todo" | null}"""
    out = _ask("chat_router", {"question": text}) or {}
    if out.get("intent") not in ("my_info", "document"):
        return {"intent": "document", "topic": None}
    return {"intent": out["intent"], "topic": out.get("topic")}


def answer_from_docs(question: str, chunks: list[dict]) -> str | None:
    """⑪ 문서 근거 답변. 근거로 답할 수 없으면 None → '모른다' 처리."""
    if not chunks:
        return None
    out = _ask("chat_answer", {"question": question, "documents": [c["content"] for c in chunks]}) or {}
    return out.get("answer") or None


def answer_my_info(question: str, facts: dict) -> str:
    """⑫ 내 상황 답변. facts는 아침에 계산해 둔 결과."""
    out = _ask("my_info_answer", {"question": question, "facts": facts}) or {}
    return out.get("answer") or facts.get("summary") or "내 정보를 정리했어요."
