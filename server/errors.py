import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

logger = logging.getLogger(__name__)


class APIError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status = status
        self.code = code
        self.message = message


def error_response(status: int, code: str, message: str):
    headers = {"WWW-Authenticate": "Bearer"} if status == 401 else None
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}}, headers=headers)


def register_handlers(app: FastAPI):
    @app.exception_handler(APIError)
    async def api_error(request: Request, exc: APIError):
        return error_response(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, exc: RequestValidationError):
        return error_response(400, "INVALID_REQUEST", "요청 값을 확인해 주세요.")

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        messages = {404: ("NOT_FOUND", "요청한 항목을 찾을 수 없어요."), 405: ("METHOD_NOT_ALLOWED", "지원하지 않는 요청 방식이에요.")}
        code, message = messages.get(exc.status_code, ("HTTP_ERROR", "요청을 처리할 수 없어요."))
        return error_response(exc.status_code, code, message)

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception):
        # 요청 헤더·토큰·외부 서비스의 오류 본문은 기록하지 않는다.
        logger.error("처리되지 않은 서버 오류: %s", type(exc).__name__)
        return error_response(500, "INTERNAL_ERROR", "서버 오류가 발생했어요.")
