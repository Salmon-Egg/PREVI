"""챗봇이 학생 말에서 고칠 정보를 찾는다. AI가 아니라 규칙으로만 뽑고, 저장은 학생이 확인 버튼을 눌러야 된다."""
import re

ASKS = {
    "toeic_score": "토익 점수가 몇 점이세요? 알려 주시면 조건을 바로 비교해 드릴게요.",
    "income_bracket": "소득분위(구간)가 몇 구간이세요? 알려 주시면 조건을 바로 비교해 드릴게요. 말하고 싶지 않으면 건너뛰어도 돼요.",
    "residence": "어느 시·군·구에 사세요? 알려 주시면 지역 장학금도 찾아 드릴게요.",
}
STATUS_KO = {"enrolled": "재학", "leave": "휴학", "returned": "복학"}
# 묻는 말은 정보를 알려 주는 말이 아님: "토익 800점이면 돼?"
QUESTION = re.compile(r"[?？]|뭐|몇|언제|어떻게|어디|왜|될까|되나|되니|하면|이면|인가|나요|할까|알려|있어|돼$")
IS = r"\s*(?:이야|예요|에요|이에요|입니다|이고|야|임|됐어|됐어요|올라왔어요?|요)?\s*[.!~]*\s*$"
RULES = [
    ("toeic_score", re.compile(r"(?:토익|toeic)\D{0,6}(\d{3})\s*점?", re.I), int),
    ("income_bracket", re.compile(r"(\d{1,2})\s*(?:분위|구간)"), int),
    ("residence", re.compile(r"([가-힣]{1,6}(?:시|군|구))\s*(?:에\s*)?(?:살아|살고|살아요|삽니다|거주|사는\s*중)"), str),
    ("admission_year", re.compile(r"(?<!\d)(\d{2})\s*학번"), lambda s: 2000 + int(s)),
    ("admission_year", re.compile(r"(20\d{2})\s*년?\s*(?:에\s*)?입학"), int),
]
STATUS_SAID = [("leave", r"휴학\s*(?:했어|했습니다|했어요|중이야|중이에요|중입니다|중)"),
               ("returned", r"복학\s*(?:했어|했습니다|했어요)"), ("enrolled", r"재학\s*(?:중이야|중이에요|중입니다|중|생이야)")]
BARE = {  # 비서가 바로 앞에서 물었을 때의 짧은 답: "800", "3구간", "안산시"
    "toeic_score": (re.compile(r"(\d{3})\s*점?\s*(?:이요|이에요|입니다|요)?"), int),
    "income_bracket": (re.compile(r"(\d{1,2})\s*(?:분위|구간)?\s*(?:이요|이에요|입니다|요)?"), int),
    "residence": (re.compile(r"([가-힣]{1,6}(?:시|군|구))\s*(?:이요|이에요|입니다|요)?"), str),
}
LIMITS = {"toeic_score": (10, 990), "income_bracket": (0, 10), "admission_year": (2000, 2100)}


def asked_field(assistant_text: str | None) -> str | None:
    return next((f for f, q in ASKS.items() if q in (assistant_text or "")), None)


def profile_updates(text: str, asked: str | None = None) -> dict:
    """학생 말에서 저장할 값. 없으면 {}."""
    text = text.strip()
    found = {}
    if asked and (m := BARE[asked][0].fullmatch(text)):
        found[asked] = BARE[asked][1](m.group(1))
    elif not QUESTION.search(text):
        for field, pattern, cast in RULES:
            if field not in found and (m := pattern.search(text)):
                found[field] = cast(m.group(1))
        for status, pattern in STATUS_SAID:
            if re.search(pattern, text):
                found["status"] = status
                break
        if m := re.search(r"([1-6])\s*학년(?:\s*([12])\s*학기)?" + IS, text):
            found["grade"] = int(m.group(1))
            if m.group(2):
                found["semester"] = int(m.group(2))
    return {k: v for k, v in found.items() if k not in LIMITS or LIMITS[k][0] <= v <= LIMITS[k][1]}


def describe(updates: dict) -> str:
    """확인 문장용: {"toeic_score": 800} → "토익 800점"."""
    show = {"toeic_score": "토익 {}점", "income_bracket": "소득분위 {}구간", "residence": "거주지 {}", "admission_year": "{}년 입학",
            "grade": "{}학년", "semester": "{}학기", "status": "학적 {}"}
    return ", ".join(show[k].format(STATUS_KO.get(v, v) if k == "status" else v) for k, v in updates.items())
