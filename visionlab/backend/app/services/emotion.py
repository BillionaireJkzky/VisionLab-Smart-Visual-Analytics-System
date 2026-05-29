"""
VisionLab — Facial Emotion Recognition Service (Optimised).

Performance changes:
1. DeepFace is imported at module load (it's heavy — ~3-5 s) so the
   first request does not pay this cost.
2. `warmup_emotion()` runs one tiny analysis to load the underlying
   weights into memory at worker startup.
3. The image is resized to a max edge of 720 px before the face detector
   runs. DeepFace's OpenCV detector slows roughly quadratically with size.
4. If detections from YOLO already say there is no `person` in the frame,
   we skip the DeepFace call entirely with `skip_if_no_person=True`. This
   is the single biggest win on object-only images (cars, food, scenery).

Output modes are unchanged: standard / simple / social_story.
"""
from __future__ import annotations

import logging
from typing import List, Optional

import numpy as np
from PIL import Image

# Heavy import done once, not per request.
try:
    from deepface import DeepFace
    _DEEPFACE_OK = True
except Exception as exc:  # noqa: BLE001
    logging.getLogger(__name__).error("DeepFace import failed: %s", exc)
    _DEEPFACE_OK = False
    DeepFace = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

EMOTION_MAX_EDGE = 720

_EMOTION_META = {
    "happy":    {"label": "Happy 😊",    "meaning": "the person may be feeling joyful or comfortable",
                 "social": "I can smile back or speak in a friendly way."},
    "sad":      {"label": "Sad 😢",      "meaning": "the person may be feeling upset, tired, or unhappy",
                 "social": "I can be gentle and ask if they are okay."},
    "angry":    {"label": "Angry 😠",    "meaning": "something may have upset or frustrated the person",
                 "social": "I can stay calm and give them space."},
    "surprise": {"label": "Surprised 😲", "meaning": "something unexpected may have happened",
                 "social": "It is okay to feel surprised sometimes."},
    "fear":     {"label": "Scared 😨",   "meaning": "the person may be feeling worried or frightened",
                 "social": "I can respond calmly and help them feel safe."},
    "disgust":  {"label": "Disgusted 🤢", "meaning": "the person may dislike something they saw or smelled",
                 "social": "Everyone has things they do not like, and that is okay."},
    "neutral":  {"label": "Calm 😐",     "meaning": "the person seems calm, relaxed, or neutral right now",
                 "social": "A neutral face is normal."},
}


def warmup_emotion() -> None:
    if not _DEEPFACE_OK:
        return
    try:
        dummy = np.zeros((128, 128, 3), dtype=np.uint8)
        DeepFace.analyze(
            img_path=dummy, actions=["emotion"], detector_backend="opencv",
            enforce_detection=False, silent=True,
        )
        logger.info("DeepFace warmed up.")
    except Exception as exc:  # noqa: BLE001
        logger.warning("DeepFace warm-up failed: %s", exc)


def _confidence_phrase(c: float) -> str:
    return "very likely" if c >= 0.9 else "likely" if c >= 0.75 else "possibly" if c >= 0.55 else "may be"


def _strength_phrase(c: float) -> str:
    return "very strong" if c >= 0.9 else "clear" if c >= 0.75 else "moderate" if c >= 0.55 else "soft"


def _safe_emotion_key(emotion: str) -> str:
    emotion = (emotion or "").strip().lower()
    return emotion if emotion in _EMOTION_META else "neutral"


def _has_valid_face_region(analysis: dict) -> bool:
    region = analysis.get("region") or {}
    return int(region.get("w", 0) or 0) >= 24 and int(region.get("h", 0) or 0) >= 24


def _normalize_analyses(analyses) -> list[dict]:
    if analyses is None:
        return []
    if isinstance(analyses, list):
        return [a for a in analyses if isinstance(a, dict)]
    if isinstance(analyses, dict):
        return [analyses]
    return []


def _build_text(emotion: str, confidence: float, mode: str, idx: int, total: int) -> tuple[str, str]:
    emotion = _safe_emotion_key(emotion)
    meta = _EMOTION_META[emotion]
    label = meta["label"]

    if mode == "simple":
        return label, label

    likely = _confidence_phrase(confidence)
    strength = _strength_phrase(confidence)
    who = "This person" if total == 1 else f"Face {idx + 1}"

    if mode == "social_story":
        text = (
            f"{who} {likely} feels {emotion}. "
            f"When someone looks {emotion}, {meta['meaning']}. "
            f"{meta['social']}"
        )
    else:
        text = (
            f"{who} {likely} looks {emotion}. "
            f"The expression appears {strength}, which suggests {meta['meaning']}."
        )
    return label, text


def _resize_for_emotion(image: Image.Image) -> Image.Image:
    w, h = image.size
    long_edge = max(w, h)
    if long_edge <= EMOTION_MAX_EDGE:
        return image
    scale = EMOTION_MAX_EDGE / long_edge
    return image.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.BILINEAR)


def _has_person_in_detections(detections: Optional[List[dict]]) -> bool:
    if not detections:
        return False
    return any((d.get("label") or "").lower() == "person" for d in detections)


def run_emotion_recognition(
    image: Image.Image,
    mode: str = "standard",
    detections: Optional[List[dict]] = None,
    skip_if_no_person: bool = True,
) -> List[dict]:
    if not _DEEPFACE_OK:
        return []

    if skip_if_no_person and detections is not None and not _has_person_in_detections(detections):
        logger.info("No 'person' in detections — skipping emotion recognition.")
        return []

    rgb = image.convert("RGB")
    resized = _resize_for_emotion(rgb)
    img_array = np.asarray(resized)

    try:
        analyses = DeepFace.analyze(
            img_path=img_array,
            actions=["emotion"],
            detector_backend="opencv",
            enforce_detection=False,
            silent=True,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("DeepFace analysis failed: %s", exc)
        return []

    analyses_list = [a for a in _normalize_analyses(analyses) if _has_valid_face_region(a)]
    if not analyses_list:
        logger.info("No reliable human face detected.")
        return []

    total_faces = len(analyses_list)
    results: List[dict] = []

    for idx, a in enumerate(analyses_list):
        dominant = _safe_emotion_key(a.get("dominant_emotion", "neutral"))
        scores = a.get("emotion", {}) or {}
        confidence = float(scores.get(dominant, 0.0)) / 100.0

        label, description = _build_text(dominant, confidence, mode, idx, total_faces)

        results.append(
            {
                "face_index": idx,
                "emotion": dominant,
                "confidence": round(confidence, 4),
                "child_friendly_label": label,
                "description": description,
            }
        )

    return results
