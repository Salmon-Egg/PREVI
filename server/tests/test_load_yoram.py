"""요람 PDF 글자 정리 확인 (스크립트 실행 없이 함수만)."""
from server.scripts.load_yoram import _unspace


def test_unspace_joins_spaced_english_only():
    assert _unspace("Hello W o r l d 과목") == "Hello World 과목"
    assert _unspace("A I 개론, I am a student") == "A I 개론, I am a student"  # 두 글자는 그대로
    assert _unspace("제 5 조(목적) 졸 업") == "제 5 조(목적) 졸 업"
