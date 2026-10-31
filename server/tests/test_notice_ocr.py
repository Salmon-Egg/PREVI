import subprocess
import io

import pytest

from server.jobs import attachments, image_ocr
from server.jobs.pipeline import verdict_for


@pytest.mark.parametrize("output", [b"", "800만 원".encode()])
def test_ocr_sends_image_to_bounded_cpu_process(monkeypatch, output):
    from PIL import Image
    data = io.BytesIO()
    Image.new("RGB", (20, 20), "white").save(data, format="PNG")
    monkeypatch.setenv("NOTICE_OCR_DIR", "/ocr")
    def run(command, **kwargs):
        assert command[1:3] == ["stdin", "stdout"]
        assert command[-2:] == ["--psm", "6"]
        assert kwargs["timeout"] == 60 and kwargs["check"]
        assert kwargs["env"]["OMP_THREAD_LIMIT"] == "2"
        assert kwargs["input"].startswith(b"\x89PNG")
        return subprocess.CompletedProcess(command, 0, output, b"")
    monkeypatch.setattr(image_ocr.subprocess, "run", run)
    if output:
        assert image_ocr.read_image(data.getvalue()) == "800만 원"
    else:
        with pytest.raises(ValueError, match="결과 없음"):
            image_ocr.read_image(data.getvalue())


def test_second_poster_with_eligibility_table_is_not_skipped(monkeypatch):
    monkeypatch.setattr(attachments, "fetch_school", lambda *_: b"image")
    monkeypatch.delenv("NOTICE_OCR_DIR", raising=False)
    calls = []
    def read(*_):
        calls.append(1)
        return "모집 안내" * 100 if len(calls) == 1 else "둘째 등록금 70%"
    monkeypatch.setattr(attachments.ai_client, "read_image", read)
    text = attachments.attachment_text([
        {"file_key": "2026/10/first.png"}, {"file_key": "2026/10/table.png"}])
    assert "둘째 등록금 70%" in text
    assert len(calls) == 2


def test_configured_ocr_does_not_fall_back_to_hallucinated_vision(monkeypatch):
    monkeypatch.setenv("NOTICE_OCR_DIR", "/ocr")
    monkeypatch.setattr(attachments, "fetch_school", lambda *_: b"image")
    def fail(*_):
        raise subprocess.TimeoutExpired("tesseract", 60)
    monkeypatch.setattr(image_ocr, "read_image", fail)
    monkeypatch.setattr(attachments.ai_client, "read_image", lambda *_: pytest.fail("vision fallback"))
    text = attachments.attachment_text([{"file_key": "2026/10/poster.png"}])
    assert image_ocr.REVIEW in text
    assert "판독 실패" in text


@pytest.mark.parametrize("target", [{}, {"grades": [1]}])
def test_uncertain_image_never_confirms_or_rejects_student(target):
    notice = {"body": image_ocr.REVIEW + "\n8000원", "target": target, "conditions": {}}
    verdict, reasons = verdict_for(notice, {"grade": 3}, [])
    assert verdict == "check"
    assert "원문 대조" in reasons[0]
