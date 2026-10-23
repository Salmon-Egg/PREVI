"""AI를 부르는 곳은 이 파일 하나 (팀 규칙 8번).
AI_FAKE=1 이면 Ollama 대신 ai/fake.py가 답합니다. 학교 서버가 준비되면 .env에서 0으로 바꾸기만 하면 됩니다."""
import json
from pathlib import Path

import config
from ai import fake

PROMPTS = Path(__file__).parent / "prompts"


class AiError(Exception):
    pass


def _prompt(name: str) -> str:
    return (PROMPTS / f"{name}.txt").read_text(encoding="utf-8")


def _client():
    from openai import OpenAI  # 가짜 모드에서는 불러오지 않음
    return OpenAI(base_url=config.AI_BASE_URL, api_key="ollama", timeout=60)  # Ollama는 키를 검사하지 않음


def ask_json(prompt_name: str, user: str) -> dict:
    """지시문 prompts/<prompt_name>.txt + 입력 → JSON. 깨지면 한 번 다시 묻고, 또 깨지면 AiError."""
    if config.AI_FAKE:
        return fake.answer_json(prompt_name, user)
    messages = [{"role": "system", "content": _prompt(prompt_name)}, {"role": "user", "content": user}]
    for _ in range(2):
        res = _client().chat.completions.create(
            model=config.CHAT_MODEL, messages=messages, response_format={"type": "json_object"}, temperature=0.1,
        )
        try:
            return json.loads(res.choices[0].message.content)
        except (json.JSONDecodeError, TypeError):
            continue
    raise AiError(f"{prompt_name}: JSON 형식이 두 번 깨짐")


def embed(texts: list[str]) -> list[list[float]] | None:
    """문장 → 검색용 숫자(벡터). 가짜 모드이거나 임베딩 모델이 없으면 None (그때는 글자 검색)."""
    if config.AI_FAKE or not config.EMBED_MODEL:
        return None
    res = _client().embeddings.create(model=config.EMBED_MODEL, input=texts)
    return [d.embedding for d in res.data]
