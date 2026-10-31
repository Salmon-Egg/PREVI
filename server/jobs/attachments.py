"""공지 첨부(사진·PDF·HWP)의 글자를 읽어 공지 해석에 함께 넘긴다. 포스터만 올라오는 공지는 본문에 조건이 없음."""
import io
import logging
import os
import re

import httpx
from pypdf import PdfReader

from server.ai import client as ai_client
from server.jobs.collect_notices import BASE, fetch_school
from server.logic.course_file import read_text
from server.jobs import image_ocr

log = logging.getLogger(__name__)
MARK = "\n\n[첨부 내용]\n"  # 이 표시가 있는 공지는 이미 읽은 것
MAX_CHARS = 2500  # 모델 컨텍스트 4096 토큰 안에 지시문·본문과 같이 들어가야 함
ENOUGH_CHARS = 300
MAX_FILES = 4
KEY = re.compile(r"\d{4}/\d{2}/[\w-]+\.(jpe?g|png|pdf|hwp)", re.I)  # 학교 게시판 파일 키 (zip·hwpx 등은 안 읽음)
IMAGE_TYPE = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}


def readable(attachments: list[dict]) -> list[dict]:
    return [a for a in attachments or [] if KEY.fullmatch(a.get("file_key") or "")][:MAX_FILES]


def _file_text(key: str, data: bytes) -> str:
    ext = key.rsplit(".", 1)[-1].lower()
    if ext == "pdf":
        parts = []
        for page_no, page in enumerate(PdfReader(io.BytesIO(data)).pages[:5], 1):
            text = (page.extract_text() or "").strip()
            if len(text) < 50 and os.getenv("NOTICE_OCR_DIR", "").strip():
                try:
                    text = image_ocr.read_pdf_page(data, page_no)
                except Exception as exc:
                    log.warning("스캔 PDF 판독 실패 page=%s type=%s", page_no, type(exc).__name__)
                    text = "PDF 판독 실패: 원문 확인 필요"
                text = image_ocr.REVIEW + "\n" + text
            parts.append(text)
        return "\n".join(parts)
    if ext == "hwp":
        return read_text(data)
    if os.getenv("NOTICE_OCR_DIR", "").strip():
        text = image_ocr.read_image(data)
    else:
        text = ai_client.read_image(data, IMAGE_TYPE[ext])
    return image_ocr.REVIEW + "\n" + text if text.strip() else ""


def attachment_text(attachments: list[dict]) -> str:
    """읽은 글자를 합쳐 돌려줌. 파일 하나가 실패해도 나머지는 읽음 (공지 해석을 막지 않음)."""
    parts = []
    document_chars = 0
    # 글자로 된 파일 먼저. 이미 충분히 읽었으면 포스터는 안 봄 (같은 내용일 때가 많고, 사진 읽기는 느리고 오독이 있음)
    files = sorted(readable(attachments), key=lambda a: a["file_key"].rsplit(".", 1)[-1].lower() in IMAGE_TYPE)
    with httpx.Client(timeout=30, follow_redirects=False, headers={"User-Agent": "Mozilla/5.0"}) as client:
        for a in files:
            is_image = a["file_key"].rsplit(".", 1)[-1].lower() in IMAGE_TYPE
            if is_image and document_chars >= ENOUGH_CHARS:
                continue
            try:
                data = fetch_school(client, f"{BASE}/wp-content/uploads/{a['file_key']}")
                # \x00 등 제어 문자가 있으면 Postgres가 저장을 거부함 (실제 PDF에서 나옴)
                text = re.sub(r"[ \t\x00-\x08\x0b\x0c\x0e-\x1f]+", " ", _file_text(a["file_key"], data)).strip()
            except Exception as exc:  # 망가진 파일·모델 꺼짐·용량 초과 등 종류가 많고, 전부 '이 파일만 건너뜀'으로 같음
                log.warning("공지 첨부 읽기 실패 key=%s type=%s", a["file_key"], type(exc).__name__)
                if a["file_key"].rsplit(".", 1)[-1].lower() in IMAGE_TYPE:
                    parts.append(image_ocr.REVIEW + "\n사진 판독 실패: 원문 확인 필요")
                continue
            if text:
                parts.append(text)
                if not is_image:
                    document_chars += len(text)
    return "\n\n".join(parts)[:MAX_CHARS]
