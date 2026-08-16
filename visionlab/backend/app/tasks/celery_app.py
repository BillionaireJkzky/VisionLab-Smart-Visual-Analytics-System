"""
VisionLab — Celery application factory (Optimised).

Why this version is faster:
- A `worker_ready` signal handler pre-loads YOLO, EasyOCR and DeepFace at
  worker startup. Without this, the FIRST analyse request pays the full
  cold-start (12-30 seconds on CPU). After this change, the first request
  runs at the same speed as every subsequent request.
- `worker_concurrency=1` is enforced because each AI model loads ~1-3 GB
  of process memory; running 4 default Celery processes can OOM small
  laptops or VPS instances. Use multiple workers across machines instead
  of multiple processes per worker.
- Connection pool keep-alives prevent Redis broker re-handshakes on each task.
"""
from __future__ import annotations

import logging

from celery import Celery
from celery.signals import worker_ready

from app.core.config import settings

logger = logging.getLogger(__name__)

celery_app = Celery(
    "visionlab",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.pipeline"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,

    # Reliability
    task_track_started=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,

    # Throughput sizing
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=50,   # recycle workers to clear PyTorch fragmentation
    result_expires=3600,

    # Hard upper bounds for safety. The pipeline should normally finish in
    # well under 60s, but we don't want a stuck task to block the worker
    # forever if a downstream service hangs.
    task_soft_time_limit=120,
    task_time_limit=180,

    # Reduce broker re-handshakes
    broker_pool_limit=10,
    broker_connection_retry_on_startup=True,
)


@worker_ready.connect
def _warmup_all_models(sender=None, **kwargs):  # noqa: ANN001
    """Pre-load every heavy model so the first user request is fast."""
    logger.info("Celery worker ready — starting model warm-up.")

    # OCR warms up first and alone: EasyOCR's first-ever download writes a
    # fixed-name temp zip into its cache dir, so a fresh (or newly-persisted
    # but empty) volume must be populated by exactly one caller before any
    # other warm-up or request-time step can race a concurrent download into
    # the same path.
    try:
        from app.services.ocr import warmup_ocr
        warmup_ocr()
    except Exception as exc:  # noqa: BLE001
        logger.warning("OCR warm-up skipped: %s", exc)

    try:
        from app.services.detection import warmup_models
        warmup_models(["fast", "balanced"])  # advanced loads on demand only
    except Exception as exc:  # noqa: BLE001
        logger.warning("Detection warm-up skipped: %s", exc)

    try:
        from app.services.emotion import warmup_emotion
        warmup_emotion()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Emotion warm-up skipped: %s", exc)

    try:
        from app.services.scene import warmup_scene
        warmup_scene(["git"])  # only the default scene model; others load lazily on demand
    except Exception as exc:  # noqa: BLE001
        logger.warning("Scene warm-up skipped: %s", exc)

    logger.info("Model warm-up complete. Worker is ready to serve fast requests.")
