from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from server.config import Settings
from server.errors import register_handlers
from server.routes.me import router as me_router
from server.routes.grades import router as grades_router
from server.routes.graduation import router as graduation_router
from server.routes.timetable import router as timetable_router


def create_app(settings: Settings | None = None, transport: httpx.AsyncBaseTransport | None = None):
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings or Settings.from_env()
        async with httpx.AsyncClient(timeout=10, transport=transport, follow_redirects=False) as client:
            app.state.http = client
            yield

    app = FastAPI(title="서경 AI 비서 API", version="0.1.0", lifespan=lifespan)
    register_handlers(app)
    app.include_router(me_router)
    app.include_router(grades_router)
    app.include_router(graduation_router)
    app.include_router(timetable_router)

    @app.get("/health", tags=["운영"])
    async def health():
        """서버 실행 여부만 확인한다. DB 연결 확인과는 별개다."""
        return {"status": "ok"}

    return app


app = create_app()
