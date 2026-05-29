from __future__ import annotations

import logging
import re
import uuid
from typing import Annotated, List

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.models import AnalysisTask, User
from app.schemas.schemas import (
    AnalysisResult,
    DetectionObject,
    EmotionResult,
    OCRResult,
    QuizQuestion,
    SceneResult,
    StoryResult,
    TaskStatusResponse,
)
from app.tasks.celery_app import celery_app
from app.tasks.pipeline import analyse_image

router = APIRouter(prefix="/analysis", tags=["Image Analysis"])
logger = logging.getLogger(__name__)

_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"}
_MAX_SIZE_MB = 10
_ALLOWED_EMOTION_MODES = {"standard", "simple", "social_story"}
_ALLOWED_STORY_TYPES = {"fun_adventure", "social_story", "educational"}
_ALLOWED_DIFFICULTIES = {"beginner", "intermediate", "advanced"}
_ALLOWED_DETECTOR_MODELS = {"fast", "balanced", "advanced"}
_ALLOWED_SCENE_MODELS = {"blip", "git", "vitgpt2"}
# BCP-47 / ISO 639-1: 2–3 letter code optionally followed by region (e.g. "zh-cn", "en-us")
_LANGUAGE_CODE_RE = re.compile(r'^[a-z]{2,3}(-[a-z]{2,8})?$', re.IGNORECASE)

_ALLOWED_CURRENT_STEPS = {
    "queued",
    "detection",
    "emotion",
    "ocr",
    "scene",
    "story",
    "tts",
    "quiz",
    "completed",
    "failed",
}

_ALLOWED_STATUSES = {"pending", "processing", "completed", "failed"}


def _default_step_details() -> dict:
    return {
        "detection": {"status": "waiting", "seconds": None},
        "emotion": {"status": "waiting", "seconds": None},
        "ocr": {"status": "waiting", "seconds": None},
        "scene": {"status": "waiting", "seconds": None},
        "story": {"status": "waiting", "seconds": None},
        "tts": {"status": "waiting", "seconds": None},
        "quiz": {"status": "waiting", "seconds": None},
    }


def _normalize_status(value: str | None) -> str:
    if value in _ALLOWED_STATUSES:
        return value
    return "pending"


def _normalize_current_step(value: str | None) -> str | None:
    if value in _ALLOWED_CURRENT_STEPS:
        return value
    return None


def _normalize_progress_percent(value: int | None, status_value: str) -> int:
    if isinstance(value, int):
        return max(0, min(100, value))
    if status_value == "completed":
        return 100
    return 0


def _normalize_step_details(value) -> dict:
    if isinstance(value, dict):
        merged = _default_step_details()
        for step_name, step_info in value.items():
            if step_name in merged and isinstance(step_info, dict):
                merged[step_name] = {
                    "status": step_info.get("status", merged[step_name]["status"]),
                    "seconds": step_info.get("seconds", merged[step_name]["seconds"]),
                }
        return merged
    return _default_step_details()


def serialize_task(task: AnalysisTask) -> TaskStatusResponse:
    normalized_status = _normalize_status(task.status)
    normalized_current_step = _normalize_current_step(task.current_step)
    normalized_step_details = _normalize_step_details(task.step_details)
    normalized_progress_percent = _normalize_progress_percent(
        task.progress_percent,
        normalized_status,
    )

    return TaskStatusResponse(
        task_id=task.id,
        celery_task_id=task.celery_task_id,
        status=normalized_status,
        created_at=task.created_at,
        completed_at=task.completed_at,
        processing_ms=task.processing_ms,
        original_filename=task.original_filename,
        current_step=normalized_current_step,
        progress_message=task.progress_message,
        progress_percent=normalized_progress_percent,
        step_details=normalized_step_details,
        error_message=task.error_message,
    )


@router.post("/upload", response_model=TaskStatusResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_image(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
    emotion_mode: str = Form(default="standard"),
    story_type: str = Form(default="fun_adventure"),
    difficulty: str = Form(default="beginner"),
    output_language: str = Form(default="en"),
    detector_model: str = Form(default="balanced"),
    scene_model: str = Form(default="git"),
):
    if file.content_type not in _ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type: {file.content_type}. Allowed: JPEG, PNG, WEBP, GIF, BMP.",
        )

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    size_mb = len(image_bytes) / (1024 * 1024)
    if size_mb > _MAX_SIZE_MB:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large ({size_mb:.1f} MB). Maximum allowed: {_MAX_SIZE_MB} MB.",
        )

    if emotion_mode not in _ALLOWED_EMOTION_MODES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid emotion_mode '{emotion_mode}'. Allowed: {sorted(_ALLOWED_EMOTION_MODES)}.",
        )
    if story_type not in _ALLOWED_STORY_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid story_type '{story_type}'. Allowed: {sorted(_ALLOWED_STORY_TYPES)}.",
        )
    if difficulty not in _ALLOWED_DIFFICULTIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid difficulty '{difficulty}'. Allowed: {sorted(_ALLOWED_DIFFICULTIES)}.",
        )
    if detector_model not in _ALLOWED_DETECTOR_MODELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid detector_model '{detector_model}'. Allowed: {sorted(_ALLOWED_DETECTOR_MODELS)}.",
        )
    if scene_model not in _ALLOWED_SCENE_MODELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid scene_model '{scene_model}'. Allowed: {sorted(_ALLOWED_SCENE_MODELS)}.",
        )
    if not _LANGUAGE_CODE_RE.match(output_language):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid output_language '{output_language}'. Expected BCP-47 code (e.g. 'en', 'fr', 'zh-cn').",
        )

    task_record = AnalysisTask(
        user_id=current_user.id,
        original_filename=file.filename,
        status="pending",
        current_step="queued",
        progress_message="Waiting in queue...",
        progress_percent=0,
        step_details=_default_step_details(),
        error_message=None,
    )
    db.add(task_record)

    # Commit first so Celery can always find and update the row.
    await db.commit()
    await db.refresh(task_record)

    try:
        celery_task = analyse_image.delay(
            task_id=str(task_record.id),
            user_id=str(current_user.id),
            image_bytes=image_bytes,
            emotion_mode=emotion_mode,
            story_types=[story_type],
            difficulty=difficulty,
            output_language=output_language,
            detector_model=detector_model,
            scene_model=scene_model,
        )

        task_record.celery_task_id = celery_task.id
        await db.commit()
        await db.refresh(task_record)

    except Exception as e:
        logger.exception("Failed to enqueue analysis task for user_id=%s", str(current_user.id))
        task_record.status = "failed"
        task_record.current_step = "failed"
        task_record.progress_message = "Failed to enqueue analysis task."
        task_record.error_message = str(e)
        await db.commit()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to enqueue analysis task: {str(e)}",
        )

    return serialize_task(task_record)


@router.get("/tasks/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(
    task_id: uuid.UUID,
    response: Response,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"

    result = await db.execute(
        select(AnalysisTask).where(
            AnalysisTask.id == task_id,
            AnalysisTask.user_id == current_user.id,
        )
    )
    task = result.scalar_one_or_none()

    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")

    return serialize_task(task)


@router.post("/tasks/{task_id}/cancel")
async def cancel_task(
    task_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(AnalysisTask).where(
            AnalysisTask.id == task_id,
            AnalysisTask.user_id == current_user.id,
        )
    )
    task = result.scalar_one_or_none()

    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")

    if task.status in {"completed", "failed"}:
        return {"message": "Task already finished."}

    if task.celery_task_id:
        celery_app.control.revoke(task.celery_task_id, terminate=True)

    step_details = _normalize_step_details(task.step_details)

    for step_name, step_info in step_details.items():
        if isinstance(step_info, dict) and step_info.get("status") == "running":
            step_info["status"] = "failed"

    task.status = "failed"
    task.current_step = "failed"
    task.progress_message = "Task cancelled by user."
    task.progress_percent = 0
    task.step_details = step_details
    task.error_message = "Cancelled by user."

    await db.commit()
    await db.refresh(task)

    return {"message": "Task cancelled."}


@router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(AnalysisTask).where(
            AnalysisTask.id == task_id,
            AnalysisTask.user_id == current_user.id,
        )
    )
    task = result.scalar_one_or_none()

    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")

    if task.status in {"pending", "processing"}:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete a running task. Cancel it first.",
        )

    await db.delete(task)
    await db.commit()

    return {"message": "Task deleted."}


@router.get("/result/{task_id}", response_model=AnalysisResult)
async def get_task_result(
    task_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(AnalysisTask).where(
            AnalysisTask.id == task_id,
            AnalysisTask.user_id == current_user.id,
        )
    )
    task = result.scalar_one_or_none()

    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")

    if task.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_202_ACCEPTED,
            detail=f"Task is not yet completed. Current status: {task.status}",
        )

    return AnalysisResult(
        task_id=task.id,
        status=task.status,
        detections=[DetectionObject(**d) for d in (task.detection_results or [])],
        emotions=[EmotionResult(**e) for e in (task.emotion_results or [])],
        ocr=OCRResult(**task.ocr_results) if task.ocr_results else None,
        scene=SceneResult(**task.scene_results) if task.scene_results else None,
        stories=[StoryResult(**s) for s in (task.story_results or [])],
        quiz_questions=[QuizQuestion(**q) for q in (task.quiz_questions or [])],
        audio_url=task.audio_url,
        annotated_image_url=task.annotated_image_url,
        processing_ms=task.processing_ms,
    )


@router.get("/history", response_model=List[TaskStatusResponse])
async def get_history(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    result = await db.execute(
        select(AnalysisTask)
        .where(AnalysisTask.user_id == current_user.id)
        .order_by(AnalysisTask.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    tasks = result.scalars().all()
    return [serialize_task(task) for task in tasks]