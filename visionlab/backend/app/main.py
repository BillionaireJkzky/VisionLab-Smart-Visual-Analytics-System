from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api.admin import router as admin_router
from app.api.analysis import router as analysis_router
from app.api.auth import router as auth_router
from app.api.vocabulary import router as vocabulary_router
from app.core.config import settings
from app.core.database import Base, engine
from app.core.middleware import RateLimitMiddleware, RequestIDMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("visionlab")

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    settings.image_dir.mkdir(parents=True, exist_ok=True)
    settings.audio_dir.mkdir(parents=True, exist_ok=True)

    logger.info("VisionLab backend started. version=%s", settings.APP_VERSION)
    yield

    await engine.dispose()


app = FastAPI(
    title="VisionLab API",
    description=(
        "Smart Visual Analytics System – AI-powered accessibility and visual "
        "learning for children with ASD and English language learners."
    ),
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Middleware add order is LIFO — execution order: RequestID → RateLimit → CORS → router
app.add_middleware(RequestIDMiddleware)
app.add_middleware(RateLimitMiddleware, redis_url=settings.REDIS_URL)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(analysis_router, prefix="/api/v1")
app.include_router(vocabulary_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")

app.mount("/audio", StaticFiles(directory=str(settings.audio_dir)), name="audio")
app.mount("/images", StaticFiles(directory=str(settings.image_dir)), name="images")


@app.get("/health", tags=["Health"])
async def health_check() -> JSONResponse:
    checks: dict[str, str] = {}

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        logger.warning("Health check: database ping failed: %s", exc)
        checks["database"] = "error"

    try:
        r = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        await r.ping()
        await r.aclose()
        checks["redis"] = "ok"
    except Exception as exc:
        logger.warning("Health check: redis ping failed: %s", exc)
        checks["redis"] = "error"

    all_ok = all(v == "ok" for v in checks.values())
    return JSONResponse(
        status_code=200 if all_ok else 503,
        content={
            "status": "ok" if all_ok else "degraded",
            "service": "VisionLab API",
            "version": settings.APP_VERSION,
            "checks": checks,
        },
    )
