"""서버 시작점. server/ 폴더에서:  uvicorn main:app --reload
API 문서: http://localhost:8000/docs"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import errors
from routes import chat, home, me, notifications, school, study, todos

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="서경 AI 비서 API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])  # 웹 내보내기 링크용
errors.install(app)

for r in (me, home, todos, school, study, chat, notifications):
    app.include_router(r.router)


@app.get("/health")
def health():
    return {"ok": True}
