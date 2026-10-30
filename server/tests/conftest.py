import pytest


@pytest.fixture(autouse=True)
def prevent_live_pipeline_from_unit_tests(monkeypatch):
    # 단위 테스트의 가짜 사용자 요청이 실제 Supabase 작업을 시작하지 않게 한다.
    monkeypatch.setenv('SUPABASE_SECRET_KEY', '')
