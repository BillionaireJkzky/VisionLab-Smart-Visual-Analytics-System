from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_access_token(token)
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise credentials_exception
        try:
            user_uuid = uuid.UUID(user_id)
        except ValueError:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(
        select(User).where(
            User.id == user_uuid,
            User.is_active == True,
        )
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user


async def get_admin_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return current_user