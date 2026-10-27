"""학교 공개 학사·장학 공지를 수집한다. 기본 실행은 미리보기이며 저장은 --save로 지정한다."""
import argparse
from datetime import datetime, timedelta, timezone
import logging
import os
import re
import time
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
import httpx

from server.config import Settings

BASE = "https://www.skuniv.ac.kr"
KST = timezone(timedelta(hours=9))
logger = logging.getLogger(__name__)
MAX_BYTES = 3_000_000


def school_url(url: str) -> str:
    parsed = urlparse(urljoin(BASE, url))
    if parsed.scheme != "https" or parsed.hostname != "www.skuniv.ac.kr" or parsed.port not in (None, 443) or parsed.username or parsed.password:
        raise ValueError("학교 공개 페이지 외의 주소")
    return parsed.geturl()


def parse_listing(html: bytes) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser", from_encoding="utf-8")
    posts = {}
    for row in soup.select("tr"):
        link = row.select_one('.post-title a[href]')
        if link is None:
            continue
        url = school_url(link["href"])
        match = re.fullmatch(r"/notice/(\d+)/?", urlparse(url).path)
        if match is None:
            continue
        category = row.select_one(".category-badge")
        posts.setdefault(match[1], {"board_post_id": match[1], "url": BASE + "/notice/" + match[1],
                           "category": category.get_text(strip=True) if category else "미분류"})
    if not posts:
        raise ValueError("학교 공지 목록 구조 확인 필요")
    return list(posts.values())


def parse_notice(html: bytes, listing: dict) -> dict:
    soup = BeautifulSoup(html, "html.parser", from_encoding="utf-8")
    root = soup.select_one(".post-detail-wrap")
    title = root.select_one(".title-wrap h3") if root else None
    content = root.select_one(".post-content-wrap") if root else None
    if root is None or title is None or content is None:
        raise ValueError("학교 공지 본문 구조 확인 필요")
    date_text = next((node.get_text(strip=True) for node in root.select(".base-meta-data-wrap .meta-value")
                      if re.fullmatch(r"\d{4}-\d{2}-\d{2}", node.get_text(strip=True))), None)
    if date_text is None:
        raise ValueError("공지 게시일 확인 필요")
    for node in content.select("script,style,noscript"):
        node.decompose()
    body = content.get_text("\n", strip=True)
    attachments = []
    for link in root.select(".attachment-wrap a"):
        key = link.get("data-file-key")
        href = link.get("href", "")
        url = school_url(href) if href and href != "#" else None
        attachments.append({"name": link.get_text(" ", strip=True), "url": url, "file_key": key})
    for image in content.select("img[src]"):
        try:
            url = school_url(image["src"])
        except ValueError:
            continue
        attachments.append({"name": image.get("alt", "본문 이미지"), "url": url, "kind": "inline_image"})
    if not body:
        if not attachments:
            raise ValueError("공지 본문 비어 있음")
        body = "이미지 또는 첨부파일로 작성된 공지입니다. 원문을 확인하세요."
    return {**listing, "title": title.get_text(" ", strip=True), "body": body,
            "posted_at": datetime.fromisoformat(date_text).replace(tzinfo=KST).isoformat(),
            "attachments": attachments, "extraction_status": "pending"}


def fetch_school(client: httpx.Client, url: str) -> bytes:
    for attempt in range(2):
        try:
            current = school_url(url)
            for redirect in range(4):
                with client.stream("GET", current) as response:
                    if response.status_code in (301, 302, 303, 307, 308):
                        current = school_url(urljoin(current, response.headers["location"]))
                        continue
                    response.raise_for_status()
                    chunks = []
                    size = 0
                    for chunk in response.iter_bytes():
                        size += len(chunk)
                        if size > MAX_BYTES:
                            raise ValueError("공지 페이지 용량 초과")
                        chunks.append(chunk)
                    return b"".join(chunks)
            raise ValueError("공지 리디렉션 횟수 초과")
        except httpx.HTTPError:
            if attempt == 1:
                raise
            time.sleep(0.5)
    raise RuntimeError("학교 페이지 요청 실패")


def collect(school: httpx.Client, database: httpx.Client | None, pages=1, max_posts=20) -> dict:
    stats = {"found": 0, "parsed": 0, "saved": 0, "skipped": 0, "failed": 0}
    seen = set()
    for category in ("학사", "장학"):
        for page in range(1, pages + 1):
            path = "/notice" if page == 1 else f"/notice/page/{page}"
            try:
                listing_url = str(httpx.URL(BASE + path, params={"term": category}))
                listing = parse_listing(fetch_school(school, listing_url))
            except (httpx.HTTPError, ValueError, KeyError) as exc:
                stats["failed"] += 1
                logger.warning("공지 목록 수집 실패: page=%s category=%s type=%s", page, category, type(exc).__name__)
                continue
            for post in listing:
                post_id = post["board_post_id"]
                if post_id in seen:
                    continue
                if stats["found"] >= max_posts:
                    return stats
                seen.add(post_id)
                stats["found"] += 1
                try:
                    if database:
                        existing = database.get("/rest/v1/notices", params={"board_post_id": "eq." + post_id, "select": "id", "limit": 1})
                        existing.raise_for_status()
                        if existing.json():
                            stats["skipped"] += 1
                            continue
                    payload = parse_notice(fetch_school(school, post["url"]), post)
                    stats["parsed"] += 1
                    if database:
                        result = database.post("/rest/v1/notices", params={"on_conflict": "board_post_id"},
                            headers={"Prefer": "resolution=ignore-duplicates,return=representation"}, json=payload)
                        result.raise_for_status()
                        stats["saved" if result.json() else "skipped"] += 1
                except (httpx.HTTPError, ValueError, KeyError) as exc:
                    stats["failed"] += 1
                    logger.warning("공지 수집 실패: post_id=%s type=%s", post_id, type(exc).__name__)
                time.sleep(0.2)
    return stats


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--save", action="store_true", help="Supabase에 저장. 생략하면 읽기 검사만 수행")
    parser.add_argument("--pages", type=int, choices=range(1, 11), default=1)
    parser.add_argument("--max-posts", type=int, choices=range(1, 201), default=20)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    with httpx.Client(timeout=20, headers={"User-Agent": "SeokyeongAISecretary/0.1 (public notice collector)"}) as school:
        if args.save:
            settings = Settings.from_env()
            secret = os.getenv("SUPABASE_SECRET_KEY", "").strip()
            if not secret: raise RuntimeError("서버 전용 Supabase 키 설정이 필요합니다.")
            # 학교 요청과 DB 요청은 별도 클라이언트: 서버 키가 학교에 전송되지 않는다.
            with httpx.Client(base_url=settings.supabase_url, timeout=20,
                headers={"apikey": secret, "Authorization": "Bearer " + secret}) as database:
                stats = collect(school, database, args.pages, args.max_posts)
        else:
            stats = collect(school, None, args.pages, args.max_posts)
    print(stats)
    if stats["failed"]: raise SystemExit(1)


if __name__ == "__main__":
    main()
