"""DB 접근 함수. SQL은 각 파일에 직접 쓰고, 실행은 이 세 함수로만 합니다.

    rows = all_rows("select * from grades where user_id = %s", [uid])   # 여러 줄 → list[dict]
    row  = one("select * from profiles where user_id = %s", [uid])      # 한 줄 → dict 또는 None
    run("update todos set done = true where id = %s", [tid])            # 실행만
"""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

import config

Json = Jsonb  # jsonb 칸에 넣을 값은 Json(값)으로 감싸기
KST = timezone(timedelta(hours=9))


@contextmanager
def connect():
    # shortcut: 요청마다 새로 연결함. 사용자가 많아지면 psycopg_pool로 바꾸기
    with psycopg.connect(config.DATABASE_URL, row_factory=dict_row, autocommit=True) as conn:
        try:
            conn.execute("set time zone 'Asia/Seoul'")  # DB 안의 current_date를 한국 날짜로
        except psycopg.Error:
            pass  # Windows 연습용 Postgres는 시간대 이름을 모름 → UTC 그대로, 아래 _kst가 응답을 맞춤
        yield conn


def _kst(row: dict | None) -> dict | None:
    """시각은 항상 +09:00으로 돌려줌 (API 명세 1번)."""
    if row is None:
        return None
    return {k: v.astimezone(KST) if isinstance(v, datetime) and v.tzinfo else v for k, v in row.items()}


def all_rows(sql: str, params=None) -> list[dict]:
    with connect() as conn:
        return [_kst(r) for r in conn.execute(sql, params).fetchall()]


def one(sql: str, params=None) -> dict | None:
    with connect() as conn:
        return _kst(conn.execute(sql, params).fetchone())


def run(sql: str, params=None) -> None:
    with connect() as conn:
        conn.execute(sql, params)
