"""공지 사진 전용 CPU OCR. 모델·언어 파일은 서버의 별도 환경에 설치한다."""
import io
import os
import subprocess
from pathlib import Path

REVIEW = "[사진 판독: 금액·날짜·대상 조건은 원문 대조 필요]"


def read_image(data: bytes) -> str:
    from PIL import Image, ImageOps

    root = Path(os.environ["NOTICE_OCR_DIR"]).expanduser()
    with Image.open(io.BytesIO(data)) as image:
        if image.width * image.height > 20_000_000:
            raise ValueError("OCR 이미지 크기 초과")
        image = ImageOps.grayscale(ImageOps.exif_transpose(image))
        # shortcut: 표의 병합 셀 관계까지 복원하지 못함. 확정 판정에는 원문 검수가 필요하다.
        image.thumbnail((2400, 3200))
        buf = io.BytesIO()
        image.save(buf, format="PNG")
    result = subprocess.run(
        [str(root / "bin/tesseract"), "stdin", "stdout", "--tessdata-dir",
         str(root / "tessdata"), "-l", "kor+eng", "--oem", "1", "--psm", "6"],
        input=buf.getvalue(), capture_output=True, check=True, timeout=60,
        env=dict(os.environ, OMP_THREAD_LIMIT="2"),
    )
    text = result.stdout.decode("utf-8", errors="replace").strip()
    if not text:
        raise ValueError("OCR 판독 결과 없음")
    return text
