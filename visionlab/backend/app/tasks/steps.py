# Each run_*_step is a top-level function (not a closure) — required for ThreadPoolExecutor submission without capturing mutable outer scope.
from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from PIL import Image

from app.services.emotion import run_emotion_recognition
from app.services.ocr import run_ocr
from app.services.scene import generate_scene_description
from app.services.story import enrich_scene_description, generate_stories

logger = logging.getLogger(__name__)

PIPELINE_STEPS: tuple[str, ...] = (
    "detection", "emotion", "ocr", "scene", "story", "tts", "quiz",
)


@dataclass
class PipelineProgress:
    steps: dict[str, dict[str, Any]] = field(
        default_factory=lambda: {
            step: {"status": "waiting", "seconds": None}
            for step in PIPELINE_STEPS
        }
    )

    def mark_running(self, step: str) -> None:
        if step in self.steps:
            self.steps[step]["status"] = "running"

    def mark_done(self, step: str, seconds: float) -> None:
        if step in self.steps:
            self.steps[step]["status"] = "done"
            self.steps[step]["seconds"] = round(seconds, 2)

    def mark_skipped(self, step: str) -> None:
        if step in self.steps:
            self.steps[step]["status"] = "skipped"
            self.steps[step]["seconds"] = None

    def mark_failed(self, step: str) -> None:
        if step in self.steps:
            self.steps[step]["status"] = "failed"

    def mark_running_step_failed(self) -> None:
        for info in self.steps.values():
            if info.get("status") == "running":
                info["status"] = "failed"
                break

    def as_dict(self) -> dict[str, dict[str, Any]]:
        return dict(self.steps)


def top_labels(detections: list[dict], max_items: int = 4) -> list[str]:
    seen: set[str] = set()
    labels: list[str] = []
    for det in sorted(
        detections or [],
        key=lambda d: float(d.get("confidence", 0) or 0),
        reverse=True,
    ):
        label = str(det.get("label", "") or "").replace("_", " ").strip().lower()
        if not label or label in seen:
            continue
        seen.add(label)
        labels.append(label)
        if len(labels) >= max_items:
            break
    return labels


def human_list(items: list[str]) -> str:
    if not items:
        return "interesting details"
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])}, and {items[-1]}"


def primary_emotion(emotions: list[dict]) -> Optional[str]:
    if not emotions:
        return None
    first = emotions[0]
    label = first.get("child_friendly_label") or first.get("emotion")
    return str(label).strip() if label else None


def scene_unavailable(scene: Optional[dict]) -> bool:
    desc = str((scene or {}).get("description", "") or "").strip().lower()
    return not desc or desc.startswith("unable to generate scene description")


def fallback_scene_result(scene_model: str, detections: list[dict]) -> dict:
    labels = top_labels(detections, max_items=4)
    description = (
        f"This image shows {human_list(labels)}."
        if labels
        else "This image shows a scene that could not be described automatically."
    )
    return {"description": description, "model": "fallback", "requested_model": scene_model}


def build_fallback_story(
    story_type: str,
    detections: list[dict],
    emotions: list[dict],
    scene: dict,
) -> str:
    scene_text = str(scene.get("description", "") or "").strip()
    if not scene_text or scene_text.lower().startswith("unable to generate scene description"):
        scene_text = "This image shows an interesting scene."
    if scene_text[-1:] not in ".!?":
        scene_text += "."

    labels = top_labels(detections, max_items=4)
    object_text = human_list(labels)
    emotion_label = primary_emotion(emotions)
    emotion_sentence = (
        f" The mood in the image feels {emotion_label.lower()}."
        if emotion_label
        else ""
    )

    if story_type == "fun_adventure":
        return (
            f"{scene_text} In this playful moment, {object_text} invite the viewer to imagine "
            f"a small adventure.{emotion_sentence} There is something interesting to notice in "
            f"every part of the picture, and each detail helps tell a gentle, imaginative story."
        )
    if story_type == "social_story":
        return (
            f"{scene_text} This is a good moment to notice what people, objects, and space are "
            f"doing.{emotion_sentence} We can look carefully, think about what is happening, and "
            f"practice calm observation. When we name what we see, the picture becomes easier to "
            f"understand."
        )
    return (
        f"{scene_text} This scene is useful for learning vocabulary. Key words may include "
        f"{object_text}.{emotion_sentence} A learner can practice naming what they see, "
        f"describing positions, and connecting new words to real visual details."
    )


def repair_story_outputs(
    stories: list[dict],
    requested_story_types: list[str],
    detections: list[dict],
    emotions: list[dict],
    scene: dict,
) -> list[dict]:
    by_type = {str(s.get("story_type", "") or "").strip(): s for s in stories or []}
    fixed: list[dict] = []
    for story_type in requested_story_types:
        existing = by_type.get(story_type)
        content = str((existing or {}).get("content", "") or "").strip()
        if (
            not content
            or content.startswith("[Story generation failed")
            or content.startswith("[Story generation unavailable")
        ):
            content = build_fallback_story(story_type, detections, emotions, scene)
        fixed.append({"story_type": story_type, "content": content})
    return fixed


def empty_ocr_result() -> dict:
    return {"raw_text": None, "translated_text": None, "language_detected": None}


def run_emotion_step(
    image: Image.Image,
    mode: str,
    detections: list[dict],
    task_id: str,
) -> tuple[list[dict], float, Optional[Exception]]:
    logger.info("[%s] Running emotion recognition...", task_id)
    t0 = time.time()
    try:
        result = run_emotion_recognition(
            image, mode=mode, detections=detections, skip_if_no_person=True
        )
        sec = time.time() - t0
        logger.info("[%s] Emotion took %.2fs", task_id, sec)
        return result, sec, None
    except Exception as exc:
        sec = time.time() - t0
        logger.warning("[%s] Emotion recognition failed: %s", task_id, exc, exc_info=True)
        return [], sec, exc


def run_ocr_step(
    image: Image.Image,
    output_language: str,
    task_id: str,
) -> tuple[dict, float, Optional[Exception]]:
    logger.info("[%s] Running OCR...", task_id)
    t0 = time.time()
    try:
        result = run_ocr(image, target_language=output_language)
        sec = time.time() - t0
        logger.info("[%s] OCR took %.2fs", task_id, sec)
        return result, sec, None
    except Exception as exc:
        sec = time.time() - t0
        logger.warning("[%s] OCR failed: %s", task_id, exc, exc_info=True)
        return empty_ocr_result(), sec, exc


def run_scene_raw_step(
    image: Image.Image,
    scene_model: str,
    detections: list[dict],
    task_id: str,
) -> tuple[dict, float, Optional[Exception]]:
    """Generate the raw scene caption (local model only, no network call).

    Runs concurrently with emotion/OCR since it only needs the image. The
    Gemini enrichment pass happens afterwards in `run_scene_enrich_step`,
    once emotion/OCR text is available to give it context.
    """
    logger.info("[%s] Running scene caption with model '%s'...", task_id, scene_model)
    t0 = time.time()
    try:
        result = generate_scene_description(image, scene_model=scene_model)
        if scene_unavailable(result):
            sec = time.time() - t0
            logger.warning(
                "[%s] Scene model returned unavailable description. Using fallback.", task_id
            )
            return (
                fallback_scene_result(scene_model, detections),
                sec,
                RuntimeError("Scene model returned unavailable description"),
            )
        sec = time.time() - t0
        logger.info("[%s] Scene caption took %.2fs", task_id, sec)
        return result, sec, None
    except Exception as exc:
        sec = time.time() - t0
        logger.warning("[%s] Scene caption failed: %s", task_id, exc, exc_info=True)
        return fallback_scene_result(scene_model, detections), sec, exc


def run_scene_enrich_step(
    raw_result: dict,
    detections: list[dict],
    emotions: list[dict],
    ocr: Optional[dict],
    task_id: str,
) -> tuple[dict, float, Optional[Exception]]:
    """Enrich the raw caption via Gemini. Falls back silently to the raw caption on failure."""
    logger.info("[%s] Enriching scene description...", task_id)
    t0 = time.time()
    try:
        raw_caption = raw_result.get("description", "")
        enriched = enrich_scene_description(raw_caption, detections, emotions, ocr)
        result = {**raw_result, "description": enriched}
        sec = time.time() - t0
        logger.info("[%s] Scene enrichment took %.2fs", task_id, sec)
        return result, sec, None
    except Exception as exc:
        sec = time.time() - t0
        logger.warning("[%s] Scene enrichment failed: %s", task_id, exc, exc_info=True)
        return raw_result, sec, exc


def run_story_step(
    detections: list[dict],
    emotions: list[dict],
    scene: dict,
    story_types: list[str],
    ocr: Optional[dict],
    task_id: str,
) -> tuple[list[dict], float, Optional[Exception]]:
    logger.info("[%s] Generating stories...", task_id)
    t0 = time.time()
    try:
        stories = generate_stories(detections, emotions, scene, story_types, ocr=ocr)
        stories = repair_story_outputs(stories, story_types, detections, emotions, scene)
        sec = time.time() - t0
        logger.info("[%s] Stories took %.2fs", task_id, sec)
        return stories, sec, None
    except Exception as exc:
        sec = time.time() - t0
        logger.warning("[%s] Story generation failed: %s", task_id, str(exc), exc_info=True)
        return (
            repair_story_outputs([], story_types, detections, emotions, scene),
            sec,
            exc,
        )
