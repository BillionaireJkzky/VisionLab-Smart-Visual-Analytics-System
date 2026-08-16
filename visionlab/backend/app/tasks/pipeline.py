from __future__ import annotations

import io
import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Optional

from billiard.exceptions import SoftTimeLimitExceeded
from celery import Task
from PIL import Image
from sqlalchemy import create_engine, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.models import AnalysisTask, VocabularyItem
from app.services.annotate import draw_detections, save_plain_image
from app.services.detection import run_detection
from app.services.quiz import generate_quiz_questions
from app.services.tts import synthesise_audio
from app.tasks.celery_app import celery_app
from app.tasks.steps import (
    PipelineProgress,
    run_emotion_step,
    run_ocr_step,
    run_scene_enrich_step,
    run_scene_raw_step,
    run_story_step,
)

logger = logging.getLogger(__name__)

_sync_engine = None


def _get_sync_engine():
    global _sync_engine
    if _sync_engine is None:
        _sync_engine = create_engine(
            settings.SYNC_DATABASE_URL,
            pool_pre_ping=True,
            pool_size=5,
        )
    return _sync_engine


def _update_task_status(task_id: str, status: str, **kwargs) -> None:
    engine = _get_sync_engine()
    with Session(engine) as session:
        stmt = (
            update(AnalysisTask)
            .where(AnalysisTask.id == uuid.UUID(task_id))
            .values(status=status, **kwargs)
        )
        result = session.execute(stmt)
        session.commit()

        if result.rowcount == 0:
            logger.warning(
                "[%s] AnalysisTask update affected 0 rows. "
                "The task row may not have been committed yet or DB config may be mismatched.",
                task_id,
            )


def _get_task(task_id: str) -> AnalysisTask | None:
    engine = _get_sync_engine()
    with Session(engine) as session:
        return session.get(AnalysisTask, uuid.UUID(task_id))


def _set_progress(
    task_id: str,
    *,
    step: str,
    message: str,
    percent: int,
    step_details: dict,
) -> None:
    _update_task_status(
        task_id,
        "processing",
        current_step=step,
        progress_message=message,
        progress_percent=percent,
        step_details=step_details,
    )


def _upsert_vocabulary(
    session: Session, user_id: str, labels: list[str], difficulty: str
) -> None:
    seen: set[str] = set()
    unique_labels: list[str] = []
    for label in labels:
        clean = label.strip()
        if not clean or len(clean) > 128:
            continue
        key = clean.lower()
        if key in seen:
            continue
        seen.add(key)
        unique_labels.append(clean)

    if not unique_labels:
        return

    rows = [
        {"user_id": uuid.UUID(user_id), "word": label, "difficulty": difficulty}
        for label in unique_labels
    ]
    stmt = pg_insert(VocabularyItem).values(rows).on_conflict_do_nothing(
        constraint="uq_user_word"
    )
    session.execute(stmt)
    session.commit()


def _valid_story_texts(stories: list[dict]) -> list[str]:
    return [
        s.get("content", "")
        for s in stories
        if (
            s.get("content")
            and not s["content"].startswith("[Story generation failed")
            and not s["content"].startswith("[Story generation unavailable")
        )
    ]


def _safe_draw_detections(
    image: Image.Image, detections: list[dict], task_id: str
) -> str | None:
    """
    Always returns a viewable image URL when at all possible. draw_detections
    already handles the zero-detections case fine (it just returns the plain
    photo — the loop over detections is a no-op), so this only needs a
    fallback for the unexpected-error case: fall back to the untouched
    original photo rather than leaving the result with no image at all.
    """
    try:
        return draw_detections(image.copy(), detections, min_conf=0.45)
    except Exception as exc:
        logger.warning(
            "[%s] Failed to generate annotated image, falling back to original: %s",
            task_id, str(exc), exc_info=True,
        )
        try:
            return save_plain_image(image.copy())
        except Exception as fallback_exc:
            logger.error(
                "[%s] Failed to save fallback image: %s", task_id, str(fallback_exc), exc_info=True
            )
            return None


@celery_app.task(bind=True, name="visionlab.pipeline.analyse_image", max_retries=2)
def analyse_image(
    self: Task,
    task_id: str,
    user_id: str,
    image_bytes: bytes,
    emotion_mode: str = "standard",
    story_types: Optional[list] = None,
    difficulty: str = "beginner",
    output_language: str = "en",
    detector_model: str = "balanced",
    scene_model: str = "git",
):
    if story_types is None:
        story_types = ["fun_adventure", "social_story", "educational"]
    elif isinstance(story_types, str):
        story_types = [story_types]
    else:
        story_types = [str(s) for s in story_types]

    start_ms = int(time.time() * 1000)
    progress = PipelineProgress()
    celery_task_id = getattr(getattr(self, "request", None), "id", None)
    logger.info(
        "[%s] Pipeline start. celery_task_id=%s detector=%s scene=%s emotion_mode=%s",
        task_id,
        celery_task_id,
        detector_model,
        scene_model,
        emotion_mode,
    )

    try:
        # Idempotency guard: retries or duplicate deliveries must not overwrite a completed task.
        # A distributed lock in Redis was considered but the DB is the single source of truth here.
        existing_task = _get_task(task_id)
        if existing_task and existing_task.status == "completed":
            logger.info("[%s] Task already completed. Skipping duplicate pipeline run.", task_id)
            return {"status": "completed", "task_id": task_id, "duplicate": True}

        _set_progress(
            task_id,
            step="queued",
            message="Loading image...",
            percent=5,
            step_details=progress.as_dict(),
        )

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        annotated_image_url = None

        logger.info("[%s] Running object detection with model '%s'...", task_id, detector_model)
        progress.mark_running("detection")
        _set_progress(
            task_id,
            step="detection",
            message="Running object detection...",
            percent=10,
            step_details=progress.as_dict(),
        )

        t0 = time.time()
        try:
            detections = run_detection(image, detector_model=detector_model)
            annotated_image_url = _safe_draw_detections(image, detections, task_id)
            detection_sec = time.time() - t0
            logger.info("[%s] Detection took %.2fs", task_id, detection_sec)
            progress.mark_done("detection", detection_sec)
            _set_progress(
                task_id,
                step="detection",
                message=f"Detection completed ({detection_sec:.2f}s)",
                percent=25,
                step_details=progress.as_dict(),
            )
        except Exception as exc:
            detection_sec = time.time() - t0
            logger.warning("[%s] Detection failed: %s", task_id, str(exc), exc_info=True)
            detections = []
            # Detection failed, but the result should still have a viewable
            # image — fall back to the untouched original photo.
            annotated_image_url = _safe_draw_detections(image, [], task_id)
            progress.mark_failed("detection")
            _set_progress(
                task_id,
                step="detection",
                message="Detection failed, continuing without detections",
                percent=25,
                step_details=progress.as_dict(),
            )

        progress.mark_running("emotion")
        progress.mark_running("ocr")
        progress.mark_running("scene")
        _set_progress(
            task_id,
            step="emotion",
            message="Running emotion, OCR, and scene analysis...",
            percent=35,
            step_details=progress.as_dict(),
        )

        # Emotion, OCR, and the scene caption (local model only, no network) are
        # mutually independent once detection has run, so they execute concurrently.
        # native torch/TF inference releases the GIL during compute, so threads give
        # real wall-clock parallelism here (this respects the solo-pool constraint —
        # it's still one Celery task, just fanning out inside it). Results are
        # reported to the DB as each finishes (as_completed), not in submission order,
        # so the "x/7 steps" UI updates incrementally per step.
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = {
                executor.submit(run_emotion_step, image, emotion_mode, detections, task_id): "emotion",
                executor.submit(run_ocr_step, image, output_language, task_id): "ocr",
                executor.submit(run_scene_raw_step, image, scene_model, detections, task_id): "scene_raw",
            }

            emotions = ocr = scene_raw = None
            scene_raw_sec = 0.0
            scene_raw_error = None
            for future in as_completed(futures):
                name = futures[future]

                if name == "emotion":
                    emotions, emotion_sec, emotion_error = future.result()
                    if emotion_error:
                        progress.mark_failed("emotion")
                    else:
                        progress.mark_done("emotion", emotion_sec)
                    _set_progress(
                        task_id,
                        step="emotion",
                        message=(
                            "Emotion analysis unavailable, continuing..."
                            if emotion_error
                            else f"Emotion completed ({emotion_sec:.2f}s)"
                        ),
                        percent=45,
                        step_details=progress.as_dict(),
                    )

                elif name == "ocr":
                    ocr, ocr_sec, ocr_error = future.result()
                    if ocr_error:
                        progress.mark_failed("ocr")
                    else:
                        progress.mark_done("ocr", ocr_sec)
                    _set_progress(
                        task_id,
                        step="ocr",
                        message=(
                            "OCR unavailable, continuing..."
                            if ocr_error
                            else f"OCR completed ({ocr_sec:.2f}s)"
                        ),
                        percent=55,
                        step_details=progress.as_dict(),
                    )

                else:  # scene_raw — "scene" isn't marked done yet, enrichment still to come
                    scene_raw, scene_raw_sec, scene_raw_error = future.result()
                    logger.info(
                        "[%s] Scene caption ready (%.2fs, error=%s)",
                        task_id, scene_raw_sec, scene_raw_error is not None,
                    )

        # Enrichment needs emotion+OCR text for context, so it runs after the
        # parallel block above. This is a Gemini network call — skip it entirely
        # if the raw caption itself already failed (matches prior behaviour: don't
        # spend a Gemini call polishing a generic fallback, and keep reporting
        # "skipped" rather than masking the failure as "done").
        if scene_raw_error:
            scene, scene_sec, scene_error = scene_raw, scene_raw_sec, scene_raw_error
        else:
            scene, scene_sec, scene_error = run_scene_enrich_step(
                scene_raw, detections, emotions, ocr, task_id
            )
            scene_sec = scene_raw_sec + scene_sec
        if scene_error:
            progress.mark_skipped("scene")
        else:
            progress.mark_done("scene", scene_sec)
        _set_progress(
            task_id,
            step="scene",
            message=(
                f"Scene analysis completed with fallback ({scene_sec:.2f}s)"
                if scene_error
                else f"Scene analysis completed ({scene_sec:.2f}s)"
            ),
            percent=65,
            step_details=progress.as_dict(),
        )

        logger.info("[%s] Generating stories...", task_id)
        progress.mark_running("story")
        _set_progress(
            task_id,
            step="story",
            message="Generating stories...",
            percent=70,
            step_details=progress.as_dict(),
        )

        # run_story_step -> generate_stories() parallelises the per-story-type Gemini
        # calls internally (ThreadPoolExecutor), so this is already the fast path.
        stories, stories_sec, stories_error = run_story_step(
            detections, emotions, scene, story_types, ocr, task_id
        )
        if stories_error:
            progress.mark_failed("story")
        else:
            progress.mark_done("story", stories_sec)
        _set_progress(
            task_id,
            step="story",
            message=(
                "Story model unavailable, used fallback"
                if stories_error
                else f"Story generation completed ({stories_sec:.2f}s)"
            ),
            percent=80,
            step_details=progress.as_dict(),
        )

        # Audio is generated by a separate fire-and-forget Celery task so it never
        # holds up "results ready" — the pipeline completes as soon as the quiz is
        # done, and audio_url/the "tts" step fill in a little later once the
        # background task finishes. Same task_id, same polling row, same 7-step
        # contract — only the audio_url column and the "tts" step_details entry are
        # updated late, by that task instead of this one.
        logger.info("[%s] Queuing audio synthesis as a background task...", task_id)
        progress.mark_running("tts")
        _set_progress(
            task_id,
            step="tts",
            message="Audio narration generating in the background...",
            percent=88,
            step_details=progress.as_dict(),
        )
        try:
            synthesise_audio_task.delay(task_id, stories, output_language)
        except Exception as exc:
            logger.warning("[%s] Failed to queue background TTS task: %s", task_id, str(exc), exc_info=True)
            progress.mark_failed("tts")
            _set_progress(
                task_id,
                step="tts",
                message="Audio generation could not be queued",
                percent=90,
                step_details=progress.as_dict(),
            )

        logger.info("[%s] Generating quiz questions...", task_id)
        story_texts = _valid_story_texts(stories)
        detected_labels = [d["label"] for d in detections if d.get("label")]

        if story_texts:
            progress.mark_running("quiz")
            _set_progress(
                task_id,
                step="quiz",
                message="Generating quiz...",
                percent=95,
                step_details=progress.as_dict(),
            )

            t0 = time.time()
            try:
                quiz_questions = generate_quiz_questions(
                    story_texts, difficulty=difficulty, n=3, detected_labels=detected_labels
                )
                quiz_sec = time.time() - t0
                logger.info("[%s] Quiz took %.2fs", task_id, quiz_sec)
                progress.mark_done("quiz", quiz_sec)
                _set_progress(
                    task_id,
                    step="quiz",
                    message=f"Quiz generation completed ({quiz_sec:.2f}s)",
                    percent=98,
                    step_details=progress.as_dict(),
                )
            except Exception as exc:
                logger.warning(
                    "[%s] Quiz generation failed: %s", task_id, str(exc), exc_info=True
                )
                quiz_questions = []
                progress.mark_failed("quiz")
                _set_progress(
                    task_id,
                    step="quiz",
                    message="Quiz generation failed, continuing without quiz",
                    percent=98,
                    step_details=progress.as_dict(),
                )
        else:
            logger.warning("[%s] Skipping quiz generation (no story text available)", task_id)
            quiz_questions = []
            progress.mark_skipped("quiz")
            _set_progress(
                task_id,
                step="quiz",
                message="Quiz skipped — no story text available",
                percent=98,
                step_details=progress.as_dict(),
            )

        quiz_words = list({q.get("word", "") for q in quiz_questions if q.get("word")})

        elapsed_ms = int(time.time() * 1000) - start_ms
        engine = _get_sync_engine()
        with Session(engine) as session:
            _upsert_vocabulary(session, user_id, quiz_words, difficulty)

        # The background TTS task (queued above) owns audio_url and the "tts"
        # step_details entry from here on. This task never writes audio_url, and it
        # carries forward whatever the DB currently has for "tts" instead of the
        # in-memory "running" snapshot, so a fast-finishing background task's result
        # is never overwritten by this completion write.
        final_step_details = progress.as_dict()
        current_row = _get_task(task_id)
        if current_row is not None and isinstance(current_row.step_details, dict):
            current_tts = current_row.step_details.get("tts")
            if current_tts is not None:
                final_step_details["tts"] = current_tts

        _update_task_status(
            task_id,
            "completed",
            current_step="completed",
            progress_message="Completed",
            progress_percent=100,
            step_details=final_step_details,
            detection_results=detections,
            emotion_results=emotions,
            ocr_results=ocr,
            scene_results=scene,
            story_results=stories,
            quiz_questions=quiz_questions,
            annotated_image_url=annotated_image_url,
            completed_at=datetime.now(timezone.utc),
            processing_ms=elapsed_ms,
            error_message=None,
        )

        logger.info("[%s] Pipeline completed in %dms.", task_id, elapsed_ms)
        return {"status": "completed", "task_id": task_id}

    except SoftTimeLimitExceeded:
        logger.exception("[%s] Pipeline soft time limit exceeded.", task_id)
        progress.mark_running_step_failed()
        _update_task_status(
            task_id,
            "failed",
            current_step="failed",
            progress_message="Task timed out before completion.",
            progress_percent=0,
            step_details=progress.as_dict(),
            error_message="Soft time limit exceeded.",
            completed_at=datetime.now(timezone.utc),
        )
        return {"status": "failed", "task_id": task_id, "reason": "timeout"}

    except Exception as exc:
        error_text = str(exc)
        logger.exception("[%s] Pipeline failed: %s", task_id, error_text)
        progress.mark_running_step_failed()

        cancel_markers = ("cancelled", "canceled", "shutdown", "revoked", "terminated")
        if any(marker in error_text.lower() for marker in cancel_markers):
            logger.info("[%s] Task will not be retried because it was cancelled.", task_id)
            _update_task_status(
                task_id,
                "failed",
                current_step="failed",
                progress_message="Task cancelled.",
                progress_percent=0,
                step_details=progress.as_dict(),
                error_message=error_text,
                completed_at=datetime.now(timezone.utc),
            )
            return {"status": "cancelled", "task_id": task_id}

        # Only mark failed on the final attempt; keep "processing" during retry window
        # so users don't see a spurious "failed" state that self-resolves.
        is_final = self.request.retries >= self.max_retries
        if is_final:
            _update_task_status(
                task_id,
                "failed",
                current_step="failed",
                progress_message="Pipeline failed.",
                progress_percent=0,
                step_details=progress.as_dict(),
                error_message=error_text,
                completed_at=datetime.now(timezone.utc),
            )
        else:
            _update_task_status(
                task_id,
                "processing",
                current_step="queued",
                progress_message="Retrying after error…",
                step_details=progress.as_dict(),
            )
        raise self.retry(exc=exc, countdown=5)

    finally:
        logger.info("[%s] Pipeline end. celery_task_id=%s", task_id, celery_task_id)


def _mark_tts_result(
    task_id: str, *, status: str, seconds: Optional[float], audio_url: Optional[str]
) -> None:
    existing_task = _get_task(task_id)
    if existing_task is None:
        logger.warning("[%s] Cannot record TTS result — task row not found.", task_id)
        return

    step_details = dict(existing_task.step_details or {})
    step_details["tts"] = {
        "status": status,
        "seconds": round(seconds, 2) if seconds is not None else None,
    }

    _update_task_status(
        task_id,
        existing_task.status,  # preserve whatever status the main task already set
        step_details=step_details,
        audio_url=audio_url if audio_url else existing_task.audio_url,
    )


@celery_app.task(name="visionlab.pipeline.synthesise_audio_task")
def synthesise_audio_task(task_id: str, stories: list, output_language: str = "en") -> dict:
    """Generate narration audio off the pipeline's critical path.

    Runs as its own Celery task (queued from analyse_image right after the story
    step) so audio generation never delays "results ready". Updates only
    audio_url and the "tts" step_details entry on the same AnalysisTask row —
    task_id, the polling contract, and the 7-step model are unchanged.
    """
    logger.info("[%s] Background TTS task starting...", task_id)
    t0 = time.time()
    try:
        audio_url = synthesise_audio(stories, lang=output_language)
        tts_sec = time.time() - t0
        logger.info("[%s] Background TTS completed in %.2fs", task_id, tts_sec)
        _mark_tts_result(task_id, status="done", seconds=tts_sec, audio_url=audio_url)
        return {"task_id": task_id, "audio_url": audio_url}
    except Exception as exc:
        tts_sec = time.time() - t0
        logger.warning("[%s] Background TTS failed: %s", task_id, str(exc), exc_info=True)
        _mark_tts_result(task_id, status="failed", seconds=None, audio_url=None)
        return {"task_id": task_id, "audio_url": None, "error": str(exc)}
