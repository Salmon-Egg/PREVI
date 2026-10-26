"""DB 처음 만들기: 표 만들기 → 시드 → 학사요람 PDF 문단 → 문서 임베딩 → 공지 수집 → 학생별 계산.
server/ 폴더에서:  python -m scripts.init_db

빈 DB에서 한 번만 실행합니다. 이미 표가 있으면 멈춥니다. 로컬 DB를 처음부터 다시 만들려면 --reset
(--reset은 public 스키마를 통째로 지우므로 Supabase 운영 DB에는 쓰지 않기)"""
import sys
from pathlib import Path

import psycopg

import config
from jobs import collect_notices, daily_check
from scripts import load_yoram

ROOT = Path(__file__).resolve().parents[2] / "supabase"


def main() -> None:
    with psycopg.connect(config.DATABASE_URL, autocommit=True) as conn:
        if "--reset" in sys.argv:
            conn.execute("drop schema public cascade; create schema public;")
        if conn.execute("select to_regclass('public.profiles')").fetchone()[0]:
            sys.exit("이미 표가 있어요. 처음부터 다시 만들려면 --reset (로컬 DB에서만)")
        for f in sorted((ROOT / "migrations").glob("*.sql")) + [ROOT / "seed" / "seed.sql"]:
            conn.execute(f.read_text(encoding="utf-8"))
            print("실행:", f.name)

    load_yoram.main()  # 학사요람 문단 넣기 + 임베딩
    collect_notices.run()
    daily_check.run(all_now=True)


if __name__ == "__main__":
    main()
