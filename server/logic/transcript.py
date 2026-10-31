"""원문과 추출값을 대조한다. 학년 추정이나 현재 개설 과목 DB로 과거 과목을 거르지 않는다."""
import math
import re
import unicodedata

GRADES = {"A+", "A0", "B+", "B0", "C+", "C0", "D+", "D0", "F", "P"}
ALIASES = {"A": "A0", "B": "B0", "C": "C0", "D": "D0", "AO": "A0", "BO": "B0", "CO": "C0", "DO": "D0", "PASS": "P", "합격": "P", "NP": "F"}  # 서경대 증명서는 A0를 "Ao"로 찍음
EXCLUDED = {"N/A", "NA"}
# 약어만 풀어 쓰고 전공심화·자유선택을 다른 영역으로 바꾸지 않는다.
AREAS = {"전필": "전공 필수", "전공필수": "전공 필수", "전핵": "전공 핵심", "전공핵심": "전공 핵심",
         "전선": "전공 선택", "전공선택": "전공 선택", "전심": "전공 심화", "전공심화": "전공 심화",
         "전공": "전공", "전기": "전공 기초", "전공기초": "전공 기초",
         "교필": "교양 필수", "교양필수": "교양 필수", "핵심역량교양필수": "핵심역량교양필수",
         "교선": "교양 선택", "교양선택": "교양 선택", "기초학문교양선택": "기초학문교양선택",
         "자선": "자유 선택", "자유선택": "자유 선택", "일선": "일반 선택", "일반선택": "일반 선택"}
GRADE_TOKEN = re.compile(r"(?<![A-Za-z0-9])(?:N\s*/\s*A|NA|PASS|NP|[ABCD][+0O]?|F|P)(?![A-Za-z0-9+])", re.I)
SEMESTER_HEAD = re.compile(r"(\d{4})\s*년도\s*(?:([12])\s*학기|(\S*(?:계절|하계|동계|여름|겨울)\S*))")
# 구분·과목명·담당교수는 두 칸 이상 띄어 있고(과목명 안은 한 칸), 재수강 전 N/A 행은 학점이 없고, 담당교수가 없는 행도 있음
COURSE_CELL = re.compile(r"(?<![가-힣A-Za-z])(" + "|".join(sorted(AREAS, key=len, reverse=True)) + r")\s+(\S.*?)\s{2,}"
                         r"(?:[^\d\s][^\d]*?\s{2,})?(?:(\d+(?:\.\d)?)\s+)?(N/A|NP|PASS|[ABCD][+0oO]?|F|P)(?=\s|$)")
STATED_CREDITS = re.compile(r"^\s*\d+\s+(\d+)\s+[\d.]+\s+[\d.]+\s+졸업논문", re.M)
RIGHT_COLUMN = 40  # 서경대 증명서는 두 칸 표: 오른쪽 칸은 50자 뒤에서 시작


def parse_courses(text: str) -> list[dict]:
    """서경대 성적증명서(pypdf layout 글자)를 코드로 읽음. 두 칸 표라 칸마다 학기를 따로 따라감. 이 양식이 아니면 빈 목록 → AI가 읽음."""
    # shortcut: 과목명과 담당교수 사이가 한 칸이면 교수 이름이 과목명에 붙음. 미리보기에서 고칠 수 있어 둠
    rows, heads = [], {}
    for line in text.splitlines():
        for m in SEMESTER_HEAD.finditer(line):
            heads[m.start() >= RIGHT_COLUMN] = (int(m.group(1)), int(m.group(2)) if m.group(2) else m.group(3))
        for m in COURSE_CELL.finditer(line):
            year, semester = heads.get(m.start() >= RIGHT_COLUMN, (None, None))
            rows.append({"year": year, "semester": semester, "name": re.sub(r":R$", "", m.group(2).strip()),  # ":R"은 재수강 표시
                         "credits": m.group(3), "grade": m.group(4), "area": m.group(1)})
    return rows


def assign_terms(items: list[dict]) -> list[dict]:
    """수강한 학기 순서대로 1-1, 1-2 … 4-2. 휴학한 학기는 세지 않아 6학년이 나오지 않음. 9번째 학기부터는 4-2로 묶음."""
    order = sorted({(i["source_year"], i["source_semester"]) for i in items if i["source_year"] and i["source_semester"]})
    for item in items:
        if item["source_year"] and item["source_semester"]:
            n = min(order.index((item["source_year"], item["source_semester"])), 7)
            item["term"] = f"{n // 2 + 1}-{n % 2 + 1}"
    return items


def credit_check(text: str, items: list[dict]) -> dict | None:
    """읽은 과목 학점 합과 증명서 총계 취득학점. 다르면 누락·오독이 있다는 뜻."""
    stated = STATED_CREDITS.search(text)
    if not stated:
        return None
    read = sum(i["credits"] or 0 for i in items if not i["excluded"] and i["grade"] != "F")
    return {"read": read, "stated": float(stated.group(1))}


def normalized(value):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", str(value or ""))).casefold()


def _grade(value):
    value = re.sub(r"\s+", "", unicodedata.normalize("NFKC", str(value or ""))).upper()
    return ALIASES.get(value, value)


def _integer(value):
    try:
        number = float(value)
        return int(number) if math.isfinite(number) and number.is_integer() else None
    except (TypeError, ValueError):
        return None


def clean_courses(rows: list, admission_year: int | None = None, *, source_text: str = "") -> tuple[list[dict], int]:
    """입학연도는 호환 인자일 뿐 계산에 쓰지 않는다. 학생이 원문 학기를 앱 학기에 연결한 뒤 저장한다."""
    items, seen, dropped = [], set(), 0
    lines = [line.strip() for line in source_text.splitlines() if line.strip()]
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("name"), str) or not 1 <= len(row["name"].strip()) <= 200:
            dropped += 1
            continue
        name, issues = row["name"].strip(), []
        year, semester = _integer(row.get("year")), _integer(row.get("semester"))
        year = year if year is not None and 1900 <= year <= 2100 else None
        semester = semester if semester in (1, 2) else None
        if year is None or semester is None:
            issues.append("원문 수강 연도·학기 확인 필요(계절학기 포함)")
        seasonal = any(word in str(row.get("semester") or "") for word in ("계절", "하계", "동계", "여름", "겨울"))
        try:
            credits = float(row.get("credits"))
            if not math.isfinite(credits) or not 0 < credits <= 30:
                credits = None
        except (TypeError, ValueError):
            credits = None
        grade = _grade(row.get("grade"))
        raw_grade = str(row.get("grade") or "")
        area_raw = re.sub(r"\s+", "", str(row.get("area") or ""))
        area = AREAS.get(area_raw, area_raw)
        quoted = normalized(row.get("source_line"))
        name_pattern = r"\s*".join(re.escape(c) for c in unicodedata.normalize("NFKC", name).casefold() if not c.isspace())
        matches = [line for line in lines if re.search(r"(?<![A-Za-z가-힣0-9])" + name_pattern + r"(?![A-Za-z가-힣0-9])", unicodedata.normalize("NFKC", line).casefold())]
        exact = [line for line in matches if quoted and normalized(line) == quoted]
        source = exact[0] if len(exact) == 1 else matches[0] if len(matches) == 1 else ""
        if source_text:
            if not source:
                grade = ""
                issues.append("과목의 원문 행을 특정하지 못함: 성적 직접 확인 필요")
            else:
                tokens = {_grade(token) for token in GRADE_TOKEN.findall(source)}
                if len(tokens) == 1:
                    source_grade = next(iter(tokens))
                    if source_grade != grade:
                        issues.append("AI 성적과 원문이 달라 원문 성적을 적용함")
                    grade, raw_grade = source_grade, source_grade
                else:
                    grade = ""
                    issues.append("원문 행의 성적이 없거나 여러 개임: 직접 확인 필요")
                # shortcut: 한 줄에 두 이수구분이 있으면 추정하지 않는다. 원본 표 형식별 파서는 실제 표본 확보 후 보완.
                spans = [(m.start(), m.end(), value) for key, value in AREAS.items()
                         for m in re.finditer(r"(?<![가-힣])" + r"\s*".join(map(re.escape, key)) + r"(?![가-힣])", source)]
                source_areas = {value for start, end, value in spans
                                if not any(a <= start and end <= b and (a, b) != (start, end) for a, b, _ in spans)}
                if len(source_areas) == 1:
                    area = next(iter(source_areas))
                elif len(source_areas) > 1:
                    area = ""
                    issues.append("원문 행의 이수구분이 여러 개임: 직접 확인 필요")
                else:
                    area = ""
                    issues.append("원문 행에서 이수구분을 확인하지 못함")
                if credits is not None and not re.search(r"(?<![\d.])" + re.escape(f"{credits:g}") + r"(?![\d.])", source):
                    credits = None
                    issues.append("AI 학점이 원문 행에 없어 직접 확인 필요")
        excluded = grade in EXCLUDED or (not grade and _grade(raw_grade) in EXCLUDED) or seasonal
        exclusion_reason = "계절학기는 현재 저장 학기에서 지원하지 않아 제외해요." if seasonal else "N/A 등 성적 미반영 표기: 저장·학점·평점 계산에서 제외해요. 과거 성적을 추측하지 않아요." if excluded else ""
        if grade not in GRADES:
            grade = None
        if credits is None and not excluded:
            issues.append("이수 학점 확인 필요")
        if not area:
            issues.append("이수구분 확인 필요")
        if grade is None and not excluded:
            issues.append("성적 확인 필요")
        item = {"term": None, "source_year": year, "source_semester": semester,
                "course_name": name, "credits": credits, "grade": grade, "raw_grade": raw_grade,
                "area": area, "source_line": source[:1600], "issues": issues, "excluded": excluded,
                "exclusion_reason": exclusion_reason}
        key = (year, semester, name, credits, grade, raw_grade, area, excluded)
        if key not in seen:
            items.append(item)
            seen.add(key)
    return items, dropped


def unmatched_course_lines(text: str, items: list[dict]) -> list[str]:
    """AI가 누락했을 수 있는 과목 행을 미리보기에 남긴다. 정규 표 형식의 모든 행을 검출하는 것은 아니다."""
    names = [normalized(item['course_name']) for item in items]
    result = []
    for line in text.splitlines():
        if (GRADE_TOKEN.search(line) and re.search(r"(?<![가-힣])(?:전필|전선|전핵|전심|전기|교필|교선|자선|일선)(?![가-힣])", line)
                and not any(name in normalized(line) for name in names)):
            result.append(line.strip()[:1600])
    return list(dict.fromkeys(result))[:100]
