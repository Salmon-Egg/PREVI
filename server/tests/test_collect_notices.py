import httpx
import pytest

from server.jobs.collect_notices import collect, parse_listing, parse_notice, school_url

LISTING = '''<table><tr><td class="category-badge">장학</td><td class="post-title"><a href="/notice/123?term=x">공지</a></td></tr>
<tr><td class="post-title"><a href="/notice/123">중복</a></td></tr></table>'''.encode()
DETAIL = '''<div class="post-detail-wrap"><div class="title-wrap"><h3>테스트 공지</h3></div>
<ul class="base-meta-data-wrap"><li><span class="meta-value">2026-10-27</span></li></ul>
<div class="post-content-wrap"><p>공개 본문</p><script>unsafe</script></div>
<div class="attachment-wrap"><a href="#" data-file-key="2026/10/test.hwp">서식</a></div></div>'''.encode()


def test_listing_deduplicates_post_ids():
    posts = parse_listing(LISTING)
    assert len(posts) == 1
    assert posts[0]["url"] == "https://www.skuniv.ac.kr/notice/123"
    assert posts[0]["category"] == "장학"


def test_notice_parses_body_date_and_unresolved_attachment():
    notice = parse_notice(DETAIL, {"board_post_id": "123", "url": "https://www.skuniv.ac.kr/notice/123", "category": "장학"})
    assert notice["title"] == "테스트 공지"
    assert notice["body"] == "공개 본문"
    assert notice["posted_at"] == "2026-10-27T00:00:00+09:00"
    assert notice["attachments"][0] == {"name": "서식", "url": None, "file_key": "2026/10/test.hwp"}
    assert notice["extraction_status"] == "pending"
    assert "summary" not in notice


@pytest.mark.parametrize("url", ["https://evil.com/notice/1", "http://www.skuniv.ac.kr/notice/1", "https://www.skuniv.ac.kr.evil.com/", "https://user@www.skuniv.ac.kr/", "https://www.skuniv.ac.kr:8443/"])
def test_collector_rejects_other_hosts(url):
    with pytest.raises(ValueError): school_url(url)


def test_changed_page_structure_fails_explicitly():
    with pytest.raises(ValueError): parse_listing(b'<html>changed</html>')
    with pytest.raises(ValueError): parse_notice(b'<html>changed</html>', {})


def test_collector_skips_saved_post_and_never_overwrites_ai():
    def school_handler(request):
        assert "apikey" not in request.headers
        assert "authorization" not in request.headers
        assert request.url.path == "/notice"
        return httpx.Response(200, content=LISTING)
    def db_handler(request):
        assert request.method == "GET"
        return httpx.Response(200, json=[{"id": 1}])
    with httpx.Client(transport=httpx.MockTransport(school_handler)) as school, httpx.Client(base_url="https://example.supabase.co", transport=httpx.MockTransport(db_handler)) as database:
        result = collect(school, database)
        assert result["skipped"] == 1
        assert result["parsed"] == result["saved"] == 0


def test_collector_writes_pending_and_keeps_failures_retryable(monkeypatch):
    monkeypatch.setattr("server.jobs.collect_notices.time.sleep", lambda _: None)
    def school_handler(request):
        return httpx.Response(200, content=LISTING if request.url.path == "/notice" else DETAIL)
    def db_handler(request):
        if request.method == "GET": return httpx.Response(200, json=[])
        assert "ignore-duplicates" in request.headers["prefer"]
        return httpx.Response(201, json=[{"id": 1}])
    with httpx.Client(transport=httpx.MockTransport(school_handler)) as school, httpx.Client(base_url="https://example.supabase.co", transport=httpx.MockTransport(db_handler)) as database:
        result = collect(school, database)
        assert result["saved"] == 1 and result["failed"] == 0


def test_failed_detail_is_counted_and_not_saved(monkeypatch):
    monkeypatch.setattr("server.jobs.collect_notices.time.sleep", lambda _: None)
    def handler(request):
        return httpx.Response(200, content=LISTING) if request.url.path == "/notice" else httpx.Response(503)
    with httpx.Client(transport=httpx.MockTransport(handler)) as school:
        assert collect(school, None)["failed"] == 1
