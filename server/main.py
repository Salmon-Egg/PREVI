import threading
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.ai import client as ai_client
from server.config import Settings
from server.errors import register_handlers
from server.routes.me import router as me_router
from server.routes.grades import router as grades_router
from server.routes.graduation import router as graduation_router
from server.routes.timetable import router as timetable_router
from server.routes.notices import router as notices_router
from server.routes.todos import router as todos_router
from server.routes.calendar import router as calendar_router
from server.routes.scholarships import router as scholarships_router
from server.routes.home import router as home_router
from server.routes.notifications import router as notifications_router
from server.routes.chat import router as chat_router
from server.routes.admin import router as admin_router
from server.routes.lost_items import router as lost_items_router


def create_app(settings: Settings | None = None, transport: httpx.AsyncBaseTransport | None = None):
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if settings is None:  # 실제 실행일 때만 (테스트는 settings를 넘김)
            threading.Thread(target=ai_client.warm_up, daemon=True).start()
        app.state.settings = settings or Settings.from_env()
        async with httpx.AsyncClient(timeout=10, transport=transport, follow_redirects=False) as client:
            app.state.http = client
            yield

    app = FastAPI(title="서경 AI 비서 API", version="0.1.0", lifespan=lifespan)
    register_handlers(app)
    # 웹 앱(다른 주소)에서 부를 수 있게. 로그인은 쿠키가 아니라 Bearer 토큰이라 모든 주소를 열어도 토큰 없이는 못 씀
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    app.include_router(me_router)
    app.include_router(grades_router)
    app.include_router(graduation_router)
    app.include_router(timetable_router)
    app.include_router(notices_router)
    app.include_router(todos_router)
    app.include_router(calendar_router)
    app.include_router(scholarships_router)
    app.include_router(home_router)
    app.include_router(notifications_router)
    app.include_router(chat_router)
    app.include_router(admin_router)
    app.include_router(lost_items_router)

    @app.get("/health", tags=["운영"])
    async def health():
        """서버 실행 여부만 확인한다. DB 연결 확인과는 별개다."""
        return {"status": "ok"}

    return app


app = create_app()
