"""AI를 부르는 곳은 이 파일 하나 (팀 규칙 8번).
AI_FAKE=1 이면 Ollama 대신 ai/fake.py가 답합니다. 학교 서버가 준비되면 .env에서 0으로 바꾸기만 하면 됩니다."""
import json
import logging
import os
from functools import cache
from pathlib import Path

from dotenv import load_dotenv

from server.ai import fake

PROMPTS = Path(__file__).parent / "prompts"

# AI 설정은 server/config.py(BE A, Supabase 전용) 대신 여기서 .env를 읽음
load_dotenv(Path(__file__).resolve().parents[2] / ".env")
AI_FAKE = os.getenv("AI_FAKE", "0").strip().lower() in ("1", "true", "yes")
# localhost가 아니라 127.0.0.1: Windows에서 localhost는 IPv6를 먼저 시도해 호출마다 2초씩 늦어짐(10/29 실측)
AI_BASE_URL = os.getenv("AI_BASE_URL", "http://127.0.0.1:11434/v1")
CHAT_MODEL = os.getenv("CHAT_MODEL", "kanana")
EMBED_MODEL = os.getenv("EMBED_MODEL", "")
# 문서 검색: 질문과 문단의 거리가 이 값보다 크면 근거로 안 씀. 비우면 거르지 않음
DOC_MAX_DISTANCE = float(os.getenv("DOC_MAX_DISTANCE") or "inf")
# embeddinggemma 권장 머리말. 붙이면 1위 정답이 6→8/15로 늘어남(10/28). 바꾸면 load_yoram으로 문단 임베딩을 다시 넣어야 함
QUERY_FMT = "task: search result | query: {}"
DOC_FMT = "title: {} | text: {}"


class AiError(Exception):
    pass


def _prompt(name: str) -> str:
    return (PROMPTS / f"{name}.txt").read_text(encoding="utf-8")


@cache
def _client():
    from openai import OpenAI  # 가짜 모드에서는 불러오지 않음
    # max_retries=0: SDK가 시간 초과마다 몰래 두 번 더 불러 학생이 몇 분씩 기다리게 됨. 다시 묻기는 ask_json이 한 번만
    return OpenAI(base_url=AI_BASE_URL, api_key="ollama", timeout=20, max_retries=0)  # Ollama는 키를 검사하지 않음


SLOW = {"notice_summary": 60}  # 밤 작업의 긴 공지 본문. 나머지(챗봇 등)는 20초


def ask_json(prompt_name: str, user: str) -> dict:
    """지시문 prompts/<prompt_name>.txt + 입력 → JSON. 깨지면 한 번 다시 묻고, 또 깨지면 AiError."""
    if AI_FAKE:
        return fake.answer_json(prompt_name, user)
    messages = [{"role": "system", "content": _prompt(prompt_name)}, {"role": "user", "content": user}]
    for _ in range(2):
        res = _client().chat.completions.create(
            model=CHAT_MODEL, messages=messages, response_format={"type": "json_object"}, temperature=0.1,
            timeout=SLOW.get(prompt_name, 20),
        )
        text = res.choices[0].message.content
        try:
            return json.loads(text)
        except (json.JSONDecodeError, TypeError):
            # 같은 요청을 그대로 다시 보내면 같은 답이 나옴: 깨진 답을 보여 주고 고쳐 달라고 함
            messages += [{"role": "assistant", "content": text or ""}, {"role": "user", "content": "올바른 JSON 하나로만 다시 답해."}]
    raise AiError(f"{prompt_name}: JSON 형식이 두 번 깨짐")


def warm_up():
    """서버가 켜질 때 모델을 그래픽카드에 미리 올림 (첫 질문 대기 없앰). 계속 올려 두는 건 Ollama의 OLLAMA_KEEP_ALIVE=-1 몫."""
    if AI_FAKE:
        return
    import httpx
    base = AI_BASE_URL.rstrip("/").removesuffix("/v1")
    try:
        httpx.post(f"{base}/api/generate", json={"model": CHAT_MODEL, "keep_alive": -1}, timeout=120).raise_for_status()
        if EMBED_MODEL:
            httpx.post(f"{base}/api/embed", json={"model": EMBED_MODEL, "input": "warm up", "keep_alive": -1}, timeout=120).raise_for_status()
    except httpx.HTTPError as e:  # Ollama가 꺼져 있어도 서버는 뜸 (AI는 템플릿으로 대신함)
        logging.getLogger("ai").warning("모델 미리 올리기 실패: %s", e)


def embed(texts: list[str]) -> list[list[float]] | None:
    """문장 → 검색용 숫자(벡터). 가짜 모드이거나 임베딩 모델이 없으면 None (그때는 글자 검색)."""
    if AI_FAKE or not EMBED_MODEL:
        return None
    res = _client().embeddings.create(model=EMBED_MODEL, input=texts)
    return [d.embedding for d in res.data]
