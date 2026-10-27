"""학사요람 PDF → 문단 → documents/doc_chunks → 임베딩. Supabase에 서버 키(SUPABASE_SECRET_KEY)로 넣음.
009_chat_documents.sql 적용 후, 저장소 맨 위 폴더에서:  python -m server.scripts.load_yoram
(다시 실행해도 됨: 지난번 요람 문단을 지우고 새로 넣음)

넣는 곳은 학칙·학칙시행세칙·교육과정(공통)만. 연혁·교직원·학과별 과목표는 검색을 흐려서 뺌.
학칙·세칙은 조(제 N 조) 하나가 문단 하나, 교육과정은 800자 안팎으로 자름."""
import os
import re
from pathlib import Path

import httpx
from pypdf import PdfReader

from server.ai import client as ai_client  # .env도 여기서 읽힘

SEED = Path(__file__).resolve().parents[2] / "supabase" / "seed"
PDF = SEED / "2026_서경대학교_대학요람.pdf"
TITLE = "2026 서경대학교 대학요람"
# 장학금 규정은 PDF가 없어 학교 홈페이지 글을 옮겨 둔 것 (10/26). 빈 줄로 나눈 덩어리의 첫 줄이 소제목
WEB_DOCS = [
    ("장학금 규정 · 교내장학", "https://www.skuniv.ac.kr/internal-scholarships", "장학_교내장학.txt"),
    ("장학금 규정 · 장학금지급규정", "https://www.skuniv.ac.kr/scholarship-regulations", "장학_지급규정.txt"),
]
# shortcut: 쪽 번호를 2026 요람에 맞춰 적음. 새 요람으로 바꾸면 차례를 보고 다시 맞추기
SECTIONS = [("학칙", 37, 76), ("학칙시행세칙", 77, 91), ("교육과정", 92, 136)]  # PDF 쪽, 양끝 포함
MAX = 800

ARTICLE = re.compile(r"\n(?=제\s*\d+\s*조(?:의\s*\d+)?\s*\()")  # 줄 맨 앞의 "제 5 조(" 앞에서 자름
SUB_RULE = re.compile(r"\n∙\s*(.+?)\s*∙\s*\n")                  # 세칙 안의 작은 규정 이름: "∙ 편입학에 관한 시행세칙 ∙"
APPENDIX = re.compile(r"\n\s*(?:부\s*칙|\[별지|\[별표|<별표)")    # 부칙(개정 이력)·서식부터는 버림
HISTORY = re.compile(r"\((?:조\s*)?(?:개정|신설|삭제|전문개정)[^()]*\)")  # "(개정 2014. 4. 1)" 같은 개정 표시
HEADING = re.compile(r"\n\s*제\s*\d+\s*(?:장|절)\s[^\n]*|\n\s*제\s*\d+\s*조(?:의\s*\d+)?\s*(?=\n)")  # "제 8 장 …" 줄, 삭제돼 번호만 남은 조


def _pack(text: str) -> list[str]:
    """긴 글을 줄 단위로 MAX자 안팎씩 묶음."""
    out, cur = [], ""
    for line in text.splitlines():
        if cur and len(cur) + len(line) > MAX:
            out.append(cur)
            cur = ""
        cur += line + "\n"
    return out + [cur] if cur else out


def _rules(text: str, label: str) -> list[str]:
    """학칙·세칙: 작은 규정마다 부칙 앞까지만, 조 하나씩."""
    parts = SUB_RULE.split("\n" + text)  # [앞부분, 이름1, 본문1, 이름2, 본문2, ...]
    named = [(label, parts[0])] + [(f"{label} · {parts[i]}", parts[i + 1]) for i in range(1, len(parts), 2)]
    chunks = []
    for name, body in named:
        body = APPENDIX.split(body)[0]
        for art in ARTICLE.split(body):
            chunks += [f"[{name}] {c}" for c in _pack(art)]
    return chunks


def chunks_of(pdf: Path = PDF) -> list[tuple[str, str]]:
    """(구역 이름, 문단) 목록."""
    pages = PdfReader(pdf).pages
    out = []
    for name, first, last in SECTIONS:
        text = "\n".join(pages[i - 1].extract_text() or "" for i in range(first, last + 1))
        text = HEADING.sub("", HISTORY.sub("", text))
        parts = _rules(text, name) if name != "교육과정" else [f"[{name}] {c}" for c in _pack(text)]
        out += [(name, re.sub(r"[ \t]+", " ", c).strip()) for c in parts]
    return [(n, c) for n, c in out if len(c) >= 40]  # 제목만 있거나 "(삭제)"만 남은 조는 버림


def web_chunks(file: str, title: str) -> list[str]:
    """홈페이지에서 옮긴 글: 빈 줄로 나눈 덩어리마다 [제목 · 소제목] 붙여 MAX자 안팎으로."""
    out = []
    for block in (SEED / file).read_text(encoding="utf-8").strip().split("\n\n"):
        head, _, body = block.partition("\n")
        out += [f"[{title} · {head}] {c.strip()}" for c in _pack(body)]
    return out


def _db() -> httpx.Client:
    url, secret = os.getenv("SUPABASE_URL", "").rstrip("/"), os.getenv("SUPABASE_SECRET_KEY", "").strip()
    if not url or not secret:
        raise RuntimeError(".env의 SUPABASE_URL과 SUPABASE_SECRET_KEY(서버 전용)가 필요합니다.")
    return httpx.Client(base_url=f"{url}/rest/v1", timeout=60,
                        headers={"apikey": secret, "Authorization": f"Bearer {secret}", "Prefer": "return=representation"})


def _insert(db: httpx.Client, title: str, url: str | None, kind: str, contents: list[str]) -> None:
    doc = db.post("/documents", json={"title": title, "url": url, "kind": kind}).raise_for_status().json()[0]
    db.post("/doc_chunks", json=[{"document_id": doc["id"], "content": c} for c in contents]).raise_for_status()


def main() -> None:
    chunks = chunks_of()
    with _db() as db:
        for pattern in (TITLE + "*", "*(예시)", "장학금 규정 · *"):
            db.delete("/documents", params={"title": f"like.{pattern}"}).raise_for_status()
        for name, _, _ in SECTIONS:
            _insert(db, f"{TITLE} · {name}", None, "학사요람", [c for n, c in chunks if n == name])
        web = 0
        for title, url, file in WEB_DOCS:
            contents = web_chunks(file, title)
            _insert(db, title, url, "규정", contents)
            web += len(contents)
        print(f"학사요람 문단: {len(chunks)}개, 장학금 규정 문단: {web}개")
        embed_missing(db)


def embed_missing(db: httpx.Client) -> None:
    """임베딩이 빈 문단을 채움. 가짜 AI 모드면 건너뜀(챗봇은 글자 검색)."""
    chunks = db.get("/doc_chunks", params={"embedding": "is.null", "select": "id,content", "limit": 5000}).raise_for_status().json()
    done = 0
    for i in range(0, len(chunks), 32):  # 한 번에 다 보내면 문단이 많을 때 Ollama가 실패함
        part = chunks[i:i + 32]
        vectors = ai_client.embed([c["content"] for c in part])
        if not vectors:
            break
        for c, v in zip(part, vectors):
            db.patch("/doc_chunks", params={"id": f"eq.{c['id']}"}, json={"embedding": str(v)}).raise_for_status()
        done += len(vectors)
    if done:
        print(f"문서 임베딩: {done}개")
    else:
        print("문서 임베딩 건너뜀 (가짜 AI 모드 또는 EMBED_MODEL 없음) → 챗봇은 글자 검색을 씀")


if __name__ == "__main__":
    main()
