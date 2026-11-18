import logging
import os
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
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
    problems = settings.problems()
    if problems:
        # Fail the deploy instead of serving traffic with an unsafe or broken config.
        raise RuntimeError("Refusing to start: " + "; ".join(problems))
    for warning in settings.warnings():
        logger.warning(warning)
    if settings.dev_token_enabled:
        logger.warning("DEV_TOKEN_ENABLED is on. Anyone can sign in as any email. Local use only.")
    yield
    await dispose_engine()


settings = get_settings()
if settings.sentry_dsn:
    import sentry_sdk

    # Before the app is built so the FastAPI integration hooks in. No request bodies or IPs.
    sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.05, send_default_pii=False, release=os.environ.get("VERCEL_GIT_COMMIT_SHA"), environment=os.environ.get("VERCEL_ENV", "local"))

# The interactive docs and schema are for local development. On a deployed host they only
# map the API for strangers. app.openapi() still works, so CI's contract check is unaffected.
_docs = not settings.is_deployed
app = FastAPI(
    title="SwollTech",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if _docs else None,
    redoc_url="/redoc" if _docs else None,
    openapi_url="/openapi.json" if _docs else None,
)
# The analytics log is large and repetitive JSON; gzip cuts it by roughly 90%.
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex or None,
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
