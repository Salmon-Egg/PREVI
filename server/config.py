import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    publishable_key: str

    @classmethod
    def from_env(cls):
        load_dotenv(Path(__file__).resolve().parents[1] / ".env")
        url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
        key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()
        parsed = urlparse(url)
        if parsed.scheme != "https" or not parsed.hostname or not key:
            raise RuntimeError(".env의 SUPABASE_URL과 SUPABASE_PUBLISHABLE_KEY를 확인하세요.")
        return cls(url, key)
