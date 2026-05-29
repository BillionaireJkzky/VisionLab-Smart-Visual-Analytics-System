from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import AnalysisTask, QuizAttempt, User, VocabularyItem
from app.schemas.schemas import (
    QuizSubmission,
    QuizSubmissionResponse,
    ReviewWordResponse,
    VocabularyProgressItem,
    VocabularyProgressResponse,
)
from app.services.quiz import quality_from_correctness, sm2_update

router = APIRouter(prefix="/vocabulary", tags=["Vocabulary & Quiz"])


@router.get("/progress/{user_id}", response_model=VocabularyProgressResponse)
async def get_progress(
    user_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # Users can only see their own progress; admins can see anyone's
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    count_result = await db.execute(
        select(func.count()).select_from(VocabularyItem).where(VocabularyItem.user_id == user_id)
    )
    total_words = count_result.scalar_one()

    result = await db.execute(
        select(VocabularyItem)
        .where(VocabularyItem.user_id == user_id)
        .order_by(VocabularyItem.next_review_at)
        .limit(500)
    )
    items = result.scalars().all()

    return VocabularyProgressResponse(
        user_id=user_id,
        total_words=total_words,
        items=[VocabularyProgressItem.model_validate(i) for i in items],
    )


@router.get("/review/{user_id}", response_model=ReviewWordResponse)
async def get_review_words(
    user_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(VocabularyItem)
        .where(
            VocabularyItem.user_id == user_id,
            VocabularyItem.next_review_at <= now,
        )
        .order_by(VocabularyItem.next_review_at)
        .limit(200)
    )
    due_items = result.scalars().all()

    return ReviewWordResponse(
        user_id=user_id,
        due_words=[VocabularyProgressItem.model_validate(i) for i in due_items],
    )


@router.post("/quiz/submit", response_model=QuizSubmissionResponse)
async def submit_quiz_answer(
    payload: QuizSubmission,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # If a task_id is provided, verify it belongs to the current user before recording the attempt.
    if payload.task_id is not None:
        task_check = await db.execute(
            select(AnalysisTask).where(
                AnalysisTask.id == payload.task_id,
                AnalysisTask.user_id == current_user.id,
            )
        )
        if task_check.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Task not found.",
            )

    is_correct = payload.user_answer.strip().lower() == payload.correct_answer.strip().lower()
    quality = quality_from_correctness(is_correct, response_time_ms=payload.response_time_ms)

    result = await db.execute(
        select(VocabularyItem).where(
            VocabularyItem.user_id == current_user.id,
            VocabularyItem.word == payload.word,
        )
    )
    vocab_item = result.scalar_one_or_none()

    if vocab_item is None:
        vocab_item = VocabularyItem(user_id=current_user.id, word=payload.word)
        db.add(vocab_item)
        await db.flush()

    new_ef, new_interval, new_reps, next_review = sm2_update(
        easiness_factor=vocab_item.easiness_factor,
        interval=vocab_item.interval,
        repetitions=vocab_item.repetitions,
        quality=quality,
    )

    vocab_item.easiness_factor = new_ef
    vocab_item.interval = new_interval
    vocab_item.repetitions = new_reps
    vocab_item.next_review_at = next_review
    vocab_item.last_reviewed_at = datetime.now(timezone.utc)

    attempt = QuizAttempt(
        user_id=current_user.id,
        task_id=payload.task_id,
        word=payload.word,
        question_type="multiple_choice",
        question="",
        correct_answer=payload.correct_answer,
        user_answer=payload.user_answer,
        is_correct=is_correct,
        sm2_quality=quality,
    )
    db.add(attempt)
    await db.flush()

    return QuizSubmissionResponse(
        word=payload.word,
        is_correct=is_correct,
        sm2_quality=quality,
        next_review_at=next_review,
        new_interval=new_interval,
        new_easiness_factor=new_ef,
    )
