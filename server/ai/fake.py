"""가짜 AI. Ollama가 준비되기 전까지 같은 모양의 답을 규칙으로 만들어 냅니다.
진짜 AI가 붙으면 이 파일은 쓰이지 않습니다 (AI_FAKE=0). 빈 dict를 돌려주면 tasks.py가 템플릿으로 대신합니다."""
import json
import re

DEPARTMENTS = ["소프트웨어학과", "전자컴퓨터공학과"]
DATE = re.compile(r"(\d{4})[-.](\d{1,2})[-.](\d{1,2})(?:\s*\([^)]*\))?(?:\s*(\d{1,2}:\d{2}))?")


def _line(body: str, *keys: str) -> str:
    for line in body.splitlines():
        if any(line.strip().lstrip("-·• ").startswith(k) for k in keys):
            return line.strip().lstrip("-·• ")
    return ""


def _notice_summary(p: dict) -> dict:
    title, body = p["title"], p["body"]
    target_line = _line(body, "대상", "신청 대상")
    due_line = _line(body, "마감", "신청 기간", "기간")
    docs_line = _line(body, "제출 서류", "서류")

    dates = DATE.findall(due_line) or DATE.findall(body)
    deadline = None
    if dates:
        y, m, d, t = dates[-1]
        deadline = f"{y}-{int(m):02d}-{int(d):02d}T{t or '23:59'}:00+09:00"

    grades = sorted({int(x) for grp in re.findall(r"([1-4](?:\s*[·,~]\s*[1-4])*)\s*학년", target_line) for x in re.findall(r"[1-4]", grp)})
    statuses = [s for k, s in (("재학생", "enrolled"), ("휴학생", "leave"), ("복학", "returned")) if k in target_line]
    conditions = {}
    if m := re.search(r"평점\s*([0-9.]+)\s*이상", body):
        conditions["min_gpa"] = float(m.group(1))
    if m := re.search(r"(\d+)\s*학점\s*이상", body):
        conditions["min_credits"] = int(m.group(1))
    if m := re.search(r"(\d+)\s*구간\s*이하", body):
        conditions["income_max"] = int(m.group(1))

    category = "장학" if "장학" in title else "학사" if re.search("휴학|복학|수강|졸업|계절|학사|성적", title) else "일반"
    summary = [x for x in (target_line, due_line, docs_line) if x] or [title]
    documents = [d.strip() for d in re.split(r"[,·]", docs_line.split(":", 1)[-1]) if d.strip()] if docs_line else []
    return {
        "category": category,
        "summary": summary[:3],
        "deadline": deadline,
        "documents": documents,
        "target": {"grades": grades, "departments": [d for d in DEPARTMENTS if d in target_line], "statuses": statuses},
        "conditions": conditions,
    }


def _reason(p: dict) -> dict:
    head = {
        "eligible": "신청 조건을 모두 충족해요.",
        "check": "대부분 충족하지만 앱이 알 수 없는 조건이 있어 직접 확인이 필요해요.",
        "ineligible": "아쉽지만 조건을 충족하지 못했어요.",
    }.get(p["verdict"], "")
    return {"text": f"{head} " + " · ".join(p["reasons"])}


def _router(p: dict) -> dict:
    q = p["question"]
    mine = re.search(r"나|내|제가|저는|받을 수|남았", q)
    if re.search("졸업|학점", q) and mine:
        return {"intent": "my_info", "topic": "graduation"}
    if "장학" in q and mine and not re.search("휴학|조건이 뭐", q):
        return {"intent": "my_info", "topic": "scholarship"}
    if re.search("할 일|마감", q) and mine:
        return {"intent": "my_info", "topic": "todo"}
    return {"intent": "document", "topic": None}


def _answer(p: dict) -> dict:
    first = p["documents"][0]
    body = first.split(":", 1)[-1].strip()
    return {"answer": f"학교 문서에 따르면, {body}"}


_HANDLERS = {"notice_summary": _notice_summary, "reason": _reason, "chat_router": _router, "chat_answer": _answer}


def answer_json(prompt_name: str, user: str) -> dict:
    handler = _HANDLERS.get(prompt_name)
    return handler(json.loads(user)) if handler else {}
