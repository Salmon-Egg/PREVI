"""설정값은 전부 여기서 .env를 읽어 씁니다. 다른 파일은 os.environ을 직접 읽지 않습니다."""
import os
from pathlib import Path

from dotenv import load_dotenv

# 레포 맨 위의 .env (server/ 안에서 실행해도 찾도록)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _flag(name: str) -> bool:
    return os.getenv(name, "0").strip() in ("1", "true", "yes")


DATABASE_URL = os.getenv("DATABASE_URL", "")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
ALLOWED_EMAIL_DOMAIN = os.getenv("ALLOWED_EMAIL_DOMAIN", "")  # 예: skuniv.ac.kr (비우면 검사 안 함)

# 개발용 로그인: 1이면 "Bearer dev-<user_id>" 토큰을 그대로 믿음. 운영 서버에서는 반드시 0.
DEV_AUTH = _flag("DEV_AUTH")

# AI: 1이면 Ollama 대신 가짜 AI(server/ai/fake.py)가 답함. 학교 서버가 준비되면 0.
AI_FAKE = _flag("AI_FAKE")
AI_BASE_URL = os.getenv("AI_BASE_URL", "http://localhost:11434/v1")
CHAT_MODEL = os.getenv("CHAT_MODEL", "kanana")
EMBED_MODEL = os.getenv("EMBED_MODEL", "")
# 문서 검색: 질문과 문단의 거리(0=같음, 클수록 다름)가 이 값보다 크면 근거로 안 씀. 비우면 거르지 않음.
DOC_MAX_DISTANCE = float(os.getenv("DOC_MAX_DISTANCE") or "inf")

# 푸시: 1이면 실제로 Expo에 보냄. 0이면 notifications 표에만 기록.
PUSH_ENABLED = _flag("PUSH_ENABLED")
EXPO_ACCESS_TOKEN = os.getenv("EXPO_ACCESS_TOKEN", "")

# 공지 수집: 비우면 server/jobs/sample_board.json(예시 공지)을 대신 읽음
BOARD_URL = os.getenv("BOARD_URL", "")
