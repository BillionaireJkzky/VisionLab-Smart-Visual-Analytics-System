"""
VisionLab - JWT authentication and password hashing utilities.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# Pre-computed hash for dummy comparisons — prevents timing attacks that reveal valid usernames via response time.
DUMMY_HASH: str = pwd_context.hash("__dummy_visionlab__")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(
    subject: Any,
    role: str = "user",
    expires_delta: Optional[timedelta] = None,
) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    payload = {
        "sub": str(subject),
        "role": str(role),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }

    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.ALGORITHM],
    )
