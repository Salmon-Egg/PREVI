"""공지 수집 (9·13·18시).  server/ 폴더에서:  python -m jobs.collect_notices

수집(코드) → ① 공지 해석·② 대상 분류(AI) → 학생별 다시 계산 → 나에게 해당하는 새 공지 알림.
같은 글은 board_post_id로 막아서 여러 번 돌려도 중복 저장·중복 알림이 없습니다.
수집이 실패하면 crawl_logs에 남기고, AI 정리를 못 한 공지는 다음 회차에 다시 정리합니다."""
import json
import os
import re
from datetime import timedelta
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

import agent
import config
import db
import notify
from ai import tasks
from db import Json
from logic.eligibility import matches_target

# 학교 게시판 구조를 확인한 뒤 .env에서 맞추기 (글 주소에서 글 번호를 뽑는 규칙, 본문이 들어 있는 부분)
LINK_PATTERN = os.getenv("BOARD_LINK_PATTERN", r"(?:articleNo|seq|idx|no)=(\d+)")
BODY_SELECTOR = os.getenv("BOARD_BODY_SELECTOR", "")


def _sample_posts() -> list[dict]:
    """BOARD_URL이 비어 있으면 예시 공지를 씀. {D+7} 같은 자리는 오늘 기준 날짜로 바꿈."""
    raw = (Path(__file__).parent / "sample_board.json").read_text(encoding="utf-8")
    today = agent.today()
    raw = re.sub(r"\{D([+-]\d+)\}", lambda m: (today + timedelta(days=int(m.group(1)))).isoformat(), raw)
    return [{**p, "url": None} for p in json.loads(raw)]


def _crawl() -> list[dict]:
    """학교 공개 게시판 목록 → 글마다 본문. 이미 저장된 글 번호는 다시 열지 않음."""
    html = httpx.get(config.BOARD_URL, timeout=20, follow_redirects=True).text
    seen = {r["board_post_id"] for r in db.all_rows("select board_post_id from notices")}
    posts = []
    for a in BeautifulSoup(html, "html.parser").select("a[href]"):
        m = re.search(LINK_PATTERN, a["href"])
        if not m or m.group(1) in seen:
            continue
        seen.add(m.group(1))
        url = str(httpx.URL(config.BOARD_URL).join(a["href"]))
        page = BeautifulSoup(httpx.get(url, timeout=20, follow_redirects=True).text, "html.parser")
        body = page.select_one(BODY_SELECTOR) if BODY_SELECTOR else page.body
        posts.append({"post_id": m.group(1), "title": a.get_text(strip=True), "body": body.get_text("\n", strip=True) if body else "",
                      "url": url, "posted": None})
    return posts


def run() -> None:
    try:
        posts = _sample_posts() if not config.BOARD_URL else _crawl()
        new = 0
        for p in posts:
            row = db.one(
                """insert into notices (board_post_id, title, body, url, posted_at) values (%s, %s, %s, %s, %s)
                   on conflict (board_post_id) do nothing returning id""",
                [p["post_id"], p["title"], p["body"], p["url"], p["posted"]],
            )
            new += row is not None
        db.run("insert into crawl_logs (ok, new_count) values (true, %s)", [new])
    except Exception as e:  # 게시판 구조가 바뀌었거나 접속 실패. 다음 회차에 다시 시도
        db.run("insert into crawl_logs (ok, message) values (false, %s)", [str(e)[:500]])

    # ①② AI 정리 (못 한 것은 다음 회차에 다시)
    fresh = db.all_rows("select id, title, body from notices where processed_at is null")
    for n in fresh:
        s = tasks.summarize_notice(n["title"], n["body"])
        db.run(
            """update notices set category = %s, summary = %s, deadline = %s, documents = %s, target = %s, conditions = %s,
               processed_at = now() where id = %s""",
            [s["category"], Json(s["summary"]), s["deadline"], Json(s["documents"]), Json(s["target"]),
             Json(s["conditions"]), n["id"]],
        )

    # 학생별 다시 계산 → 새 공지가 나에게 해당하면 알림 (⑧)
    fresh_ids = [n["id"] for n in fresh]
    notices = db.all_rows("select * from notices where id = any(%s)", [fresh_ids]) if fresh_ids else []
    for p in db.all_rows("select * from profiles where grade is not null"):
        agent.recalc(p["user_id"])
        for n in notices:
            if n["category"] == "장학":
                e = db.one("select verdict from eligibility where user_id = %s and notice_id = %s", [p["user_id"], n["id"]])
                relevant = e is not None and e["verdict"] != "ineligible"
            else:
                relevant = any(n["target"].values()) and matches_target(n["target"], p)
            if relevant:
                due = f". 마감 {n['deadline']:%m/%d}" if n["deadline"] else ""
                notify.send(p["user_id"], "notice", f"{n['title']} 공지가 올라왔어요{due}", n["id"])
    print(f"수집 완료: 새로 정리한 공지 {len(fresh)}개")


if __name__ == "__main__":
    run()
