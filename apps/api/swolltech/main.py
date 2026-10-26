import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from swolltech.config import get_settings
from sqlalchemy import text

from swolltech.db import dispose_engine, get_engine
from swolltech.errors import ConflictError, DomainError
from swolltech.routes import router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("swolltech")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.dev_token_enabled and ("supabase.co" in settings.database_url or "pooler.supabase.com" in settings.database_url):
        logger.warning("DEV_TOKEN_ENABLED is on against a hosted database. Turn it off before going live.")
    if settings.sentry_dsn:
        import sentry_sdk

        sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.05)
    yield
    await dispose_engine()


app = FastAPI(title="SwollTech", version="0.1.0", lifespan=lifespan)
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.url.path.startswith("/v1/"):
        response.headers.setdefault("Cache-Control", "no-store")
    logger.info("%s %s %s %s", request_id, request.method, request.url.path, response.status_code)
    return response


@app.exception_handler(DomainError)
async def handle_domain(_request: Request, exc: DomainError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.detail})


@app.exception_handler(ConflictError)
async def handle_conflict(_request: Request, exc: ConflictError):
    return JSONResponse(status_code=409, content={"detail": "Updated on another device", "row": exc.row})


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/health/ready")
async def ready():
    try:
        async with get_engine().connect() as conn:
            await conn.execute(text("select 1"))
    except Exception:
        logger.exception("readiness check failed")
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return {"status": "ok"}


app.include_router(router)
