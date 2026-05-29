"""
VisionLab – HTTP middleware.
"""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

import redis.asyncio as aioredis
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


_LIMITS: dict[str, tuple[int, int]] = {
    "/api/v1/auth/login":      (10, 60),   # brute-force guard
    "/api/v1/auth/register":   (5,  60),   # spam guard
    "/api/v1/analysis/upload": (30, 60),   # quota guard
}
_RATE_LIMITED_PATHS: frozenset[str] = frozenset(_LIMITS)


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, redis_url: str) -> None:
        super().__init__(app)
        self._redis: aioredis.Redis = aioredis.from_url(
            redis_url, decode_responses=True, socket_connect_timeout=2
        )

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        if path not in _RATE_LIMITED_PATHS:
            return await call_next(request)

        max_requests, window_seconds = _LIMITS[path]
        client_ip = request.client.host if request.client else "unknown"
        key = f"rl:{path}:{client_ip}"

        try:
            current = await self._redis.incr(key)
            if current == 1:
                await self._redis.expire(key, window_seconds)
            if current > max_requests:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded. Please try again later."},
                    headers={"Retry-After": str(window_seconds)},
                )
        except Exception:
            pass  # Fail open — don't block requests when Redis is unavailable.

        return await call_next(request)
