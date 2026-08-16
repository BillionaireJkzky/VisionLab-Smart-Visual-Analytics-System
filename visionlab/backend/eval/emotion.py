"""
VisionLab eval — emotion recognition accuracy (optional, reproducible).

Emotion is already evaluated elsewhere in this project; this script exists
so the same numbers can be reproduced on demand. Calls DeepFace directly
(the same call shape app.services.emotion uses) against a labelled test set
and reports Accuracy, Macro F1, the full per-class classification report,
and a confusion matrix.

Run inside the GPU worker container (from repo root):
    docker compose exec worker python -m eval.emotion

--- Ground truth format ---
    eval/data/emotion/<label>/<image files>
e.g.
    eval/data/emotion/happy/img001.jpg
    eval/data/emotion/sad/img002.jpg

Folder names must be DeepFace's 7 output classes (or a subset of them):
angry, disgust, fear, happy, sad, surprise, neutral. If your dataset uses a
different label set (e.g. a custom taxonomy), edit LABEL_MAP below to map
your folder names onto DeepFace's classes before scoring.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from eval._common import DATA_DIR, ensure_app_importable, logger, save_json

ensure_app_importable()

EMOTION_DATA_DIR = DATA_DIR / "emotion"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

# DeepFace's 7 raw output classes — the same set app.services.emotion maps
# into child-friendly labels (see _EMOTION_META there).
DEEPFACE_LABELS = ["angry", "disgust", "fear", "happy", "sad", "surprise", "neutral"]

# Map your dataset's folder/label names onto DEEPFACE_LABELS. Identity by
# default (folder name == DeepFace class name, e.g. FER2013 / RAF-DB laid
# out as datasets/emotion/<label>/...). Edit if your dataset uses different
# names (e.g. {"fearful": "fear", "surprised": "surprise"}).
LABEL_MAP = {label: label for label in DEEPFACE_LABELS}

DETECTOR_BACKEND = "mtcnn"  # matches app.services.emotion's warmup_emotion() / run_emotion_recognition()

EXPECTED_LAYOUT = f"""\
No images found under {EMOTION_DATA_DIR}
Expected layout:
    {EMOTION_DATA_DIR}/<label>/<image files>
where <label> is one of (or maps via LABEL_MAP onto): {DEEPFACE_LABELS}
"""


@dataclass
class EmotionEvalResult:
    y_true: List[str] = field(default_factory=list)
    y_pred: List[str] = field(default_factory=list)
    no_face_count: int = 0
    unreadable_count: int = 0
    unmapped_label_count: int = 0
    total_images: int = 0
    elapsed_s: float = 0.0


def _iter_labeled_images():
    if not EMOTION_DATA_DIR.exists():
        return
    for label_dir in sorted(p for p in EMOTION_DATA_DIR.iterdir() if p.is_dir()):
        for file_path in sorted(label_dir.iterdir()):
            if file_path.suffix.lower() in IMAGE_EXTENSIONS:
                yield label_dir.name, file_path


def run_emotion_evaluation() -> Optional[EmotionEvalResult]:
    from deepface import DeepFace
    from PIL import Image, UnidentifiedImageError
    import numpy as np

    images = list(_iter_labeled_images())
    if not images:
        print(f"\n[eval.emotion] {EXPECTED_LAYOUT}")
        return None

    result = EmotionEvalResult()
    t0 = time.time()

    for raw_label, image_path in images:
        mapped_label = LABEL_MAP.get(raw_label)
        if mapped_label is None:
            logger.warning(
                "Label '%s' (from %s) has no entry in LABEL_MAP — skipping. Edit LABEL_MAP in eval/emotion.py.",
                raw_label, image_path.parent,
            )
            result.unmapped_label_count += 1
            continue

        result.total_images += 1
        try:
            image = Image.open(image_path)
            image.load()
            img_array = np.asarray(image.convert("RGB"))
        except (UnidentifiedImageError, OSError) as exc:
            logger.warning("Skipping unreadable image %s: %s", image_path, exc)
            result.unreadable_count += 1
            continue

        try:
            analyses = DeepFace.analyze(
                img_path=img_array, actions=["emotion"],
                detector_backend=DETECTOR_BACKEND, enforce_detection=False, silent=True,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("DeepFace.analyze failed on %s: %s", image_path, exc)
            result.no_face_count += 1
            continue

        analysis = analyses[0] if isinstance(analyses, list) else analyses
        predicted = analysis.get("dominant_emotion")
        if predicted not in DEEPFACE_LABELS:
            result.no_face_count += 1
            continue

        result.y_true.append(mapped_label)
        result.y_pred.append(predicted)
        logger.info("%-10s -> %-10s  (%s)", mapped_label, predicted, image_path.name)

    result.elapsed_s = time.time() - t0
    return result


def save_report(result: EmotionEvalResult) -> dict:
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score

    if not result.y_true:
        logger.error("No scoreable predictions (every image was unreadable or had no detected face).")
        return {}

    labels_present = sorted(set(result.y_true) | set(result.y_pred))
    accuracy = accuracy_score(result.y_true, result.y_pred)
    macro_f1 = f1_score(result.y_true, result.y_pred, average="macro", zero_division=0)
    report_text = classification_report(result.y_true, result.y_pred, digits=3, zero_division=0)
    report_dict = classification_report(result.y_true, result.y_pred, digits=3, zero_division=0, output_dict=True)
    cm = confusion_matrix(result.y_true, result.y_pred, labels=labels_present)

    payload = {
        "component": "emotion",
        "metric": "macro_f1",
        "accuracy": accuracy,
        "macro_f1": macro_f1,
        "labels": labels_present,
        "classification_report": report_dict,
        "confusion_matrix": cm.tolist(),
        "num_scored": len(result.y_true),
        "total_images": result.total_images,
        "no_face_count": result.no_face_count,
        "unreadable_count": result.unreadable_count,
        "unmapped_label_count": result.unmapped_label_count,
        "elapsed_s": round(result.elapsed_s, 1),
    }

    print("\n" + "=" * 60)
    print("EMOTION RECOGNITION — ACCURACY & MACRO F1")
    print("=" * 60)
    print(report_text)
    print(f"Accuracy:  {accuracy:.3f}")
    print(f"Macro F1:  {macro_f1:.3f}")
    print(f"Scored:    {len(result.y_true)} / {result.total_images}")
    print(f"No face detected: {result.no_face_count}")
    print(f"Unreadable files: {result.unreadable_count}")
    print(f"Elapsed: {result.elapsed_s:.1f}s\n")

    save_json("emotion", payload)
    return payload


if __name__ == "__main__":
    outcome = run_emotion_evaluation()
    if outcome is not None:
        save_report(outcome)
