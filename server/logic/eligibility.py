"""공지 대상·장학 조건과 내 정보를 대조 → 신청 가능 / 조건 미충족 / 확인 필요.
조건(conditions·target)은 AI가 공지 글에서 뽑아 둔 값이고, 대조는 여기서 코드로 합니다."""

STATUS_KO = {"enrolled": "재학생", "leave": "휴학생", "returned": "복학생"}


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


def judge(target: dict, conditions: dict, profile: dict, last_gpa: float | None, last_credits: int) -> tuple[str, list[str]]:
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

    verdict = "ineligible" if failed else "check" if unknown else "eligible"
    return verdict, reasons
