"""공지 대상·장학 조건과 내 정보를 대조 → 신청 가능 / 조건 미충족 / 확인 필요.
조건(conditions·target)은 AI가 공지 글에서 뽑아 둔 값이고, 대조는 여기서 코드로 합니다."""

import re

STATUS_KO = {"enrolled": "재학생", "leave": "휴학생", "returned": "복학생"}


def reviewed_conditions(conditions: dict, source_text: str = "") -> dict:
    """숫자 하나로 표현할 수 없는 예외는 탈락/통과로 확정하지 않는다.

    현재 학년·학기는 실제 등록 학기 수나 장학 심사 대상 학기가 아니다.
    공지의 8학기 예외를 임의로 4학년 2학기에 대응시키지 않는다.
    """
    result = dict(conditions)
    unknown = list(conditions.get("unknown") or [])
    clauses = unknown + re.split(r"[\n;；]", source_text)
    credit_exceptions = [s.strip() for s in clauses if "학점" in s and re.search(
        r"\d+\s*학기|졸업\s*학기|마지막\s*학기|최종\s*학기|예외|다만|(?:^|[\s(,])단\s*[,：:]", s)]
    if result.get("min_credits") is not None and credit_exceptions:
        result.pop("min_credits")
        unknown.append("이수 학점의 학기별 예외·적용 대상 확인 필요")
        unknown.extend(credit_exceptions)
    # AI가 자격 조건을 누락해도 알 수 없는 어학 점수를 충족으로 간주하지 않는다.
    for clause in re.split(r"[\n;；]", source_text):
        if re.search(r"(?:TOEIC|토익)[^\n;；]{0,60}?\d+\s*점\s*(?:이상|초과)", clause, re.I):
            unknown.append(clause.strip())
        if re.search(r"학사\s*경고[^\n;；]{0,30}?(?:받지\s*않|없|미해당|아닌|제외|비대상)", clause):
            unknown.append(clause.strip())
    result["unknown"] = list(dict.fromkeys(s for s in unknown if s))
    return result


def matches_target(target: dict, profile: dict) -> bool:
    """공지가 이 학생에게 해당하는지 (학년·학과·학적). 비어 있는 항목은 '모두'."""
    if target.get("grades") and profile["grade"] not in target["grades"]:
        return False
    if target.get("departments") and profile["department"] not in target["departments"]:
        return False
    statuses = target.get("statuses")
    # 복학생은 재학생 공지도 받음
    if statuses and profile["status"] not in statuses and not (profile["status"] == "returned" and "enrolled" in statuses):
        return False
    return True


def judge(target: dict, conditions: dict, profile: dict, last_gpa: float | None, last_credits: int, *, source_text: str = "") -> tuple[str, list[str]]:
    conditions = reviewed_conditions(conditions, source_text)
    reasons, failed, unknown = [], False, False

    if target.get("grades"):
        ok = profile["grade"] in target["grades"]
        failed |= not ok
        reasons.append(f"{profile['grade']}학년 (대상 {'·'.join(map(str, target['grades']))}학년) {'✓' if ok else '✗'}")
    if target.get("statuses"):
        ok = matches_target({"statuses": target["statuses"]}, profile)
        failed |= not ok
        reasons.append(f"{STATUS_KO.get(profile['status'], profile['status'])} {'✓' if ok else '✗'}")
    if target.get("departments"):
        ok = profile["department"] in target["departments"]
        failed |= not ok
        reasons.append(f"{profile['department']} {'✓' if ok else '✗'}")

    if conditions.get("min_gpa") is not None:
        need = conditions["min_gpa"]
        if last_gpa is None:
            unknown = True
            reasons.append(f"직전 학기 평점 기준 {need} 이상 — 성적을 입력하면 확인할 수 있어요")
        else:
            ok = last_gpa >= need
            failed |= not ok
            reasons.append(f"직전 학기 평점 {last_gpa} (기준 {need} 이상) {'✓' if ok else '✗'}")
    if conditions.get("min_credits") is not None:
        need = conditions["min_credits"]
        ok = last_credits >= need
        failed |= not ok
        reasons.append(f"직전 학기 {last_credits}학점 이수 (기준 {need}학점 이상) {'✓' if ok else '✗'}")
    if conditions.get("income_max") is not None:
        unknown = True  # 소득분위는 앱이 모름
        reasons.append(f"소득분위 {conditions['income_max']}구간 이하 — 앱이 알 수 없어 직접 확인이 필요해요")
    for text in conditions.get("unknown") or []:  # AI가 칸에 못 넣은 조건 (토익, 학사경고 등)
        unknown = True
        reasons.append(f"{text} — 직접 확인이 필요해요")

    verdict = "ineligible" if failed else "check" if unknown else "eligible"
    return verdict, reasons
