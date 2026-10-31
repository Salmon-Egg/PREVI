import pytest

from server.routes.todos import shown_reason


@pytest.mark.parametrize("stored, shown", [
    ("[자동] AI 문장\n근거: 재학생 ✓ · 신청자 — 직접 확인이 필요해요 · 동의 필요 — 직접 확인이 필요해요",
     "AI 문장\n재학생 ✓\n직접 확인이 필요해요\n· 신청자\n· 동의 필요"),
    ("[자동] 근거: 재학생 ✓ · 3학년 ✓", "재학생 ✓\n3학년 ✓"),
    ("[자동] 원문", "원문"),
    ("사용자가 공지를 보고 등록한 할 일이에요.", "사용자가 공지를 보고 등록한 할 일이에요."),
    (None, None),
])
def test_reason_hides_internal_marker(stored, shown):
    assert shown_reason(stored) == shown
