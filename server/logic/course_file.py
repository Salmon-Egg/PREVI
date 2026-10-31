"""학교 강의시간표(.hwp)에서 시간표 검색용 과목을 뽑는다. 표의 칸 위치로 읽으므로 AI를 쓰지 않는다."""
import io
import json
import re
import struct
import zlib

import olefile
from pydantic import ValidationError

from server.logic.timetable import ClassTime, validate_slots

PARA_TEXT, LIST_HEADER, TABLE = 67, 72, 77  # HWP5 레코드 종류
# 글자 자리에 16바이트를 차지하는 조판 부호 (표·그림 위치 등)
LONG_CONTROLS = {1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23}
# 학교 표: 1~9교시는 정시 50분, 21~26교시는 75분.
# shortcut: 10~13교시는 표에 없어 같은 간격으로 이어 봄. 학교 야간 시간표를 받으면 맞추기
PERIODS = {n: (f"{n + 8:02}:00", f"{n + 8:02}:50") for n in range(1, 14)} | {
    21: ("09:00", "10:15"), 22: ("10:30", "11:45"), 23: ("12:00", "13:15"),
    24: ("13:30", "14:45"), 25: ("15:00", "16:15"), 26: ("16:30", "17:45")}
AREAS = {"전심": "전공심화", "전핵": "전공핵심", "교선": "교양선택"}  # 졸업 계산이 아는 이름으로
CODE = re.compile(r"[A-Z]{2,3}\d{3,5}(-\d+)?")
SLOT = re.compile(r"([월화수목금토일]+)\s*(\d+(?:[.\s]+\d+)*)")


def course_key(name: str, times: list[dict]) -> tuple[str, str]:
    """같은 과목인지 보는 기준: 이름 + 수업 시간 (시간이 다르면 다른 분반)."""
    return name, json.dumps(times, sort_keys=True, ensure_ascii=False)


def _records(data: bytes):
    i = 0
    while i + 4 <= len(data):
        head = struct.unpack_from("<I", data, i)[0]
        i += 4
        size = head >> 20
        if size == 0xFFF:
            size = struct.unpack_from("<I", data, i)[0]
            i += 4
        yield head & 0x3FF, (head >> 10) & 0x3FF, data[i:i + size]
        i += size


def _text(body: bytes) -> str:
    out, i = [], 0
    while i + 2 <= len(body):
        c = struct.unpack_from("<H", body, i)[0]
        if c >= 32:
            out.append(chr(c))
        i += 16 if c in LONG_CONTROLS else 2
    return "".join(out).strip()


def _hwp_records(data: bytes):
    """HWP 본문 레코드를 순서대로. 읽을 수 없는 파일이면 ValueError."""
    if not olefile.isOleFile(data=data):  # 위치 인자로 주면 짧은 내용을 파일 경로로 착각함
        raise ValueError("HWP 파일이 아니에요.")
    with olefile.OleFileIO(io.BytesIO(data)) as ole:
        flags = ole.openstream("FileHeader").read()[36]
        if flags & 0b110:
            raise ValueError("암호가 걸렸거나 배포용으로 저장된 HWP는 읽을 수 없어요.")
        sections = sorted((s for s in ole.listdir() if s[0] == "BodyText"), key=lambda s: int(s[1].removeprefix("Section")))
        streams = [ole.openstream(s).read() for s in sections]
    for raw in streams:
        yield from _records(zlib.decompress(raw, -15) if flags & 1 else raw)


def read_text(data: bytes) -> str:
    """HWP의 글자 전부 (표 칸 포함, 적힌 순서대로)."""
    return "\n".join(t for tag, _, body in _hwp_records(data) if tag == PARA_TEXT and (t := _text(body)))


def read_tables(data: bytes) -> list[dict]:
    """HWP 안의 표 전부: {"rows": 줄 수, "cells": [{"c","r","cs","rs","text"}]}. 읽을 수 없는 파일이면 ValueError."""
    tables, table, cell, left = [], None, None, 0
    for tag, level, body in _hwp_records(data):
        if tag == TABLE:
            rows = struct.unpack_from("<H", body, 4)[0]
            left = sum(struct.unpack_from(f"<{rows}H", body, 18))  # 줄마다 칸 수
            table, cell = {"rows": rows, "level": level, "cells": []}, None
            tables.append(table)
        elif tag == LIST_HEADER and table and left and level == table["level"]:
            c, r, cs, rs = struct.unpack_from("<4H", body, 8)
            cell = {"c": c, "r": r, "cs": cs, "rs": rs, "text": ""}
            table["cells"].append(cell)
            left -= 1
        elif tag == PARA_TEXT and cell and level == table["level"] + 1:
            cell["text"] = f"{cell['text']} {_text(body)}".strip()
    return tables


def parse_times(text: str) -> list[dict] | None:
    """"화 21.22", "수2.3 금5.6", "화목 21", "화 6.7.8 9.10.11" → 시간표 칸. 시간으로 못 읽으면 None."""
    text = text.strip()
    if not re.fullmatch(rf"(?:{SLOT.pattern}\s*,?\s*)+", text):
        return None
    slots = []
    for days, numbers in SLOT.findall(text):
        periods = sorted({int(n) for n in re.findall(r"\d+", numbers)})
        if not all(p in PERIODS for p in periods):
            return None
        runs = []  # 이어지는 교시는 한 칸으로
        for p in periods:
            if runs and p == runs[-1][1] + 1:
                runs[-1][1] = p
            else:
                runs.append([p, p])
        slots += [{"day": d, "start": PERIODS[a][0], "end": PERIODS[b][1]} for d in days for a, b in runs]
    try:
        validate_slots([ClassTime(**s) for s in slots])
    except (ValidationError, ValueError):
        return None
    return slots


def courses_from_tables(tables: list[dict]) -> tuple[list[dict], list[str]]:
    """(넣을 과목, 수업 시간·학점을 못 읽어 건너뛴 과목 이름). 이름+시간이 같은 분반은 하나로."""
    courses, skipped = {}, []
    squeeze = lambda s: re.sub(r"[\sㆍ·]", "", s)
    for table in tables:
        head = {squeeze(c["text"]): c["c"] for c in table["cells"] if c["r"] == 0}
        if not {"학수번호", "교과목명", "학점"} <= head.keys():
            continue
        grid = {(r, k): c["text"] for c in table["cells"]
                for r in range(c["r"], c["r"] + c["rs"]) for k in range(c["c"], c["c"] + c["cs"])}  # 합친 칸은 줄마다 채움
        for r in range(1, table["rows"]):
            if not CODE.fullmatch(grid.get((r, head["학수번호"]), "")):
                continue
            name = grid.get((r, head["교과목명"]), "").strip()
            when = grid.get((r, head.get("요일교시", head.get("시간", -1))), "")  # 일부 표는 머리글이 '시간'
            area = squeeze(grid.get((r, head.get("이수구분", head.get("구분", -1))), ""))
            try:
                credits = float(grid.get((r, head["학점"]), ""))  # 졸업논문 등은 'P'
            except ValueError:
                credits = 0
            times = parse_times(when)
            if not name or not times or not 0 < credits <= 30:
                skipped.append(name)
                continue
            courses[course_key(name, times)] = {"name": name, "credits": credits, "area": AREAS.get(area, area) or "기타", "times": times}
    names = {c["name"] for c in courses.values()}
    return list(courses.values()), sorted({s for s in skipped if s and s not in names})
