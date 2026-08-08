"""
VisionLab evaluation harness — emotion recognition accuracy.

Calls the project's real `app.services.emotion.run_emotion_recognition`
(not a reimplementation) against a labelled test set and reports
Accuracy, Precision, Recall, F1 (per-class + macro/weighted) and a
confusion matrix — the standard metric set for a multi-class
classification task.

Run from backend/:
    python -m evaluation.evaluate_emotion

Dataset layout expected:
    evaluation/datasets/emotion/<label>/<image files>
e.g. evaluation/datasets/emotion/happy/img001.jpg

Labels must match (a subset of) EMOTION_LABELS below, which mirrors the
raw class set DeepFace/VisionLab's emotion.py actually returns.
"""
from __future__ import annotations

import csv
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from evaluation._common import (
    DATASETS_DIR,
    ensure_app_importable,
    ensure_results_dir,
    iter_labeled_images,
    load_image_safely,
    logger,
    require_dataset,
)

ensure_app_importable()

from sklearn.metrics import accuracy_score, classification_report, confusion_matrix  # noqa: E402

# Must match the raw label set returned by app.services.emotion.run_emotion_recognition
# (see _EMOTION_META in that module). Edit this list if that module's class set changes.
EMOTION_LABELS = ["angry", "disgust", "fear", "happy", "sad", "surprise", "neutral"]

EMOTION_DATASET_DIR = DATASETS_DIR / "emotion"
EXPECTED_LAYOUT = "datasets/emotion/<label>/<image files>, label in " + ", ".join(EMOTION_LABELS)


@dataclass
class EmotionEvalResult:
    y_true: List[str] = field(default_factory=list)
    y_pred: List[str] = field(default_factory=list)
    no_face_count: int = 0
    no_face_by_label: dict = field(default_factory=dict)
    multi_face_count: int = 0
    unreadable_count: int = 0
    total_images: int = 0
    elapsed_s: float = 0.0


def _predict_single_label(image, run_emotion_recognition) -> Optional[str]:
    """
    Run the real emotion service on one image and reduce its (possibly
    multi-face) output to a single predicted label for scoring against
    a ground-truth folder that represents one true emotion per image.

    Policy: if multiple faces are found, take the highest-confidence one
    — a documented, deliberate choice, not an accident. Test images with
    more than one face are a poor fit for this per-image-label dataset
    format in the first place; report_multi_face_count() tracks how often
    it happens so it can be caveated in the report.
    """
    results = run_emotion_recognition(image, mode="standard", detections=None)
    if not results:
        return None
    best = max(results, key=lambda r: r.get("confidence", 0.0))
    return best.get("emotion"), len(results)


def run_emotion_evaluation() -> Optional[EmotionEvalResult]:
    ensure_app_importable()
    from app.services.emotion import run_emotion_recognition  # noqa: E402

    if not require_dataset(EMOTION_DATASET_DIR, "evaluate_emotion", EXPECTED_LAYOUT):
        return None

    result = EmotionEvalResult()
    t0 = time.time()

    for label, image_path in iter_labeled_images(EMOTION_DATASET_DIR):
        if label not in EMOTION_LABELS:
            logger.warning(
                "Label '%s' (from %s) is not in EMOTION_LABELS %s — skipping. "
                "Rename the folder or update EMOTION_LABELS at the top of this script.",
                label, image_path.parent, EMOTION_LABELS,
            )
            continue

        result.total_images += 1
        image = load_image_safely(image_path)
        if image is None:
            result.unreadable_count += 1
            continue

        prediction = _predict_single_label(image, run_emotion_recognition)
        if prediction is None:
            result.no_face_count += 1
            result.no_face_by_label[label] = result.no_face_by_label.get(label, 0) + 1
            continue

        predicted_label, face_count = prediction
        if face_count > 1:
            result.multi_face_count += 1

        result.y_true.append(label)
        result.y_pred.append(predicted_label)

        logger.info(
            "%-10s -> %-10s  (%s, %d face%s)",
            label, predicted_label, image_path.name, face_count, "s" if face_count != 1 else "",
        )

    result.elapsed_s = time.time() - t0
    return result


def save_reports(result: EmotionEvalResult) -> None:
    import matplotlib
    matplotlib.use("Agg")  # headless — no display available on a dev box running this from a script
    import matplotlib.pyplot as plt
    import pandas as pd
    import seaborn as sns

    results_dir = ensure_results_dir()

    if not result.y_true:
        logger.error(
            "No scoreable predictions (every image was unreadable or had no "
            "detected face). Nothing to report — check your dataset images."
        )
        return

    labels_present = sorted(set(result.y_true) | set(result.y_pred))
    report_text = classification_report(result.y_true, result.y_pred, digits=3, zero_division=0)
    report_dict = classification_report(
        result.y_true, result.y_pred, digits=3, zero_division=0, output_dict=True
    )
    accuracy = accuracy_score(result.y_true, result.y_pred)

    print("\n" + "=" * 60)
    print("EMOTION RECOGNITION — CLASSIFICATION REPORT")
    print("=" * 60)
    print(report_text)
    print(f"Overall accuracy: {accuracy:.3f}")
    print(f"Scored images:    {len(result.y_true)} / {result.total_images}")
    print(f"No face detected: {result.no_face_count}  {result.no_face_by_label}")
    print(f"Unreadable files: {result.unreadable_count}")
    print(f"Multi-face images (used highest-confidence face): {result.multi_face_count}")
    print(f"Elapsed: {result.elapsed_s:.1f}s\n")

    # 1) emotion_metrics.csv — per-class P/R/F1/support + macro/weighted averages
    metrics_df = pd.DataFrame(report_dict).transpose()
    metrics_df.to_csv(results_dir / "emotion_metrics.csv")

    # 2) emotion_confusion_matrix.png
    cm = confusion_matrix(result.y_true, result.y_pred, labels=labels_present)
    plt.figure(figsize=(8, 6))
    sns.heatmap(
        cm, annot=True, fmt="d", cmap="Blues",
        xticklabels=labels_present, yticklabels=labels_present,
    )
    plt.xlabel("Predicted label")
    plt.ylabel("True label")
    plt.title(f"Emotion Recognition — Confusion Matrix (accuracy={accuracy:.3f})")
    plt.tight_layout()
    plt.savefig(results_dir / "emotion_confusion_matrix.png", dpi=150)
    plt.close()

    # 3) emotion_summary.txt — the printed report + the awkward-case counts
    summary_path = results_dir / "emotion_summary.txt"
    with open(summary_path, "w", encoding="utf-8") as f:
        f.write("EMOTION RECOGNITION — CLASSIFICATION REPORT\n")
        f.write("=" * 60 + "\n")
        f.write(report_text)
        f.write(f"\nOverall accuracy: {accuracy:.3f}\n")
        f.write(f"Scored images:    {len(result.y_true)} / {result.total_images}\n")
        f.write(f"No face detected: {result.no_face_count}  {result.no_face_by_label}\n")
        f.write(f"Unreadable files: {result.unreadable_count}\n")
        f.write(f"Multi-face images (used highest-confidence face): {result.multi_face_count}\n")
        f.write(f"Elapsed: {result.elapsed_s:.1f}s\n")

    print(f"Saved: {results_dir / 'emotion_metrics.csv'}")
    print(f"Saved: {results_dir / 'emotion_confusion_matrix.png'}")
    print(f"Saved: {summary_path}")


if __name__ == "__main__":
    outcome = run_emotion_evaluation()
    if outcome is not None:
        save_reports(outcome)
