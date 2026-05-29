from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import DUMMY_HASH, create_access_token, hash_password, verify_password
from app.models.models import User
from app.schemas.schemas import TokenResponse, UserLogin, UserOut, UserRegister

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(
    payload: UserRegister,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    existing = await db.execute(
        select(User).where(
            (User.username == payload.username) | (User.email == payload.email)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email already registered.",
        )

    user = User(
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: UserLogin,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(User).where(User.username == payload.username, User.is_active == True)
    )
    user = result.scalar_one_or_none()

    target_hash = user.hashed_password if user else DUMMY_HASH
    password_valid = verify_password(payload.password, target_hash)
    if not user or not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
        )

    token = create_access_token(subject=str(user.id), role=user.role)
    return TokenResponse(access_token=token, role=user.role)


@router.get("/me", response_model=UserOut)
async def me(current_user: Annotated[User, Depends(get_current_user)]):
    return current_user