from contextlib import asynccontextmanager
import logging
from typing import AsyncGenerator
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api.router import api_router
from src.core.config import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup actions
    yield
    # Shutdown actions


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan,
)


@app.exception_handler(StarletteHTTPException)
async def api_http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Return API errors using the same data/message envelope as successes."""
    message = exc.detail if isinstance(exc.detail, str) else "Request could not be completed."
    return JSONResponse(
        status_code=exc.status_code,
        content={"data": {}, "message": message},
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def api_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Keep validation failures in the standard API envelope with field errors."""
    return JSONResponse(
        status_code=422,
        content=jsonable_encoder(
            {"data": {"errors": exc.errors()}, "message": "Request validation failed."}
        ),
    )


@app.exception_handler(Exception)
async def log_unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
    """Log the full server-side traceback for errors escaping any module."""
    request_id = str(uuid4())
    logger.error(
        "Unhandled API exception request_id=%s method=%s path=%s",
        request_id,
        request.method,
        request.url.path,
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    return JSONResponse(
        status_code=500,
        content={"data": {}, "message": "Internal Server Error"},
        headers={"X-Request-Id": request_id},
    )


# Configure CORS Middleware
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.get("/health", tags=["Health"], summary="System health check")
async def health_check() -> dict[str, str]:
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
    }


@app.get("/health/live", tags=["Health"], include_in_schema=False)
async def liveness_check() -> dict[str, str]:
    """Report that the process is accepting requests."""
    return {"status": "alive"}


@app.get("/health/ready", tags=["Health"], include_in_schema=False)
async def readiness_check() -> dict[str, str]:
    """Report application readiness without exposing infrastructure details."""
    return {"status": "ready"}


# Include V1 API Router
app.include_router(api_router, prefix=settings.API_V1_STR)
