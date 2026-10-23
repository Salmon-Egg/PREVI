"""오류 응답을 { "error": { "code", "message" } } 한 모양으로 통일 (API 명세 1번)."""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        self.status, self.code, self.message = status, code, message


def not_found(what: str = "항목") -> ApiError:
    return ApiError(404, "NOT_FOUND", f"{what}을(를) 찾을 수 없어요")


def _body(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api(_: Request, e: ApiError):
        return JSONResponse(_body(e.code, e.message), status_code=e.status)

    @app.exception_handler(RequestValidationError)
    async def _invalid(_: Request, e: RequestValidationError):
        first = e.errors()[0] if e.errors() else {}
        field = ".".join(str(x) for x in first.get("loc", [])[1:])
        return JSONResponse(_body("BAD_REQUEST", f"{field} 값이 올바르지 않아요"), status_code=400)

    @app.exception_handler(HTTPException)
    async def _http(_: Request, e: HTTPException):
        return JSONResponse(_body("HTTP_" + str(e.status_code), str(e.detail)), status_code=e.status_code)

    @app.exception_handler(Exception)
    async def _crash(_: Request, e: Exception):
        return JSONResponse(_body("SERVER_ERROR", "서버에 문제가 생겼어요"), status_code=500)
