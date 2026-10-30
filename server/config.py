import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    publishable_key: str
    secret_key: str = ""  # 관리자 API만 씀
    admin_emails: frozenset[str] = frozenset()
    demo_user_ids: frozenset[str] = frozenset()

    @classmethod
    def from_env(cls):
        load_dotenv(Path(__file__).resolve().parents[1] / ".env")
        url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
        key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()
        parsed = urlparse(url)
        if parsed.scheme != "https" or not parsed.hostname or not key:
            raise RuntimeError(".env의 SUPABASE_URL과 SUPABASE_PUBLISHABLE_KEY를 확인하세요.")
        admins = frozenset(e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip())
        demos = frozenset(v.strip() for v in os.getenv("DEMO_USER_IDS", "").split(",") if v.strip())
        return cls(url, key, os.getenv("SUPABASE_SECRET_KEY", "").strip(), admins, demos)
