"""
VisionLab evaluation harness — per-stage and end-to-end latency.

Calls each real pipeline stage directly (detection, emotion, OCR, scene,
story, audio) and times it, over a batch of test images. Reports mean,
median, and p95 latency per stage — the standard set for a performance
results section (p95 in particular shows worst-realistic-case behaviour
that a mean alone hides).

Run from backend/:
    python -m evaluation.evaluate_latency

Dataset layout expected — any images, no labels/ground truth needed:
    evaluation/datasets/latency/<image files>

Note: this calls the same story/audio functions the app uses, so it will
write real audio files to the app's configured audio_outputs/ directory
as a normal side effect of calling synthesise_audio() — same as using the
app itself. No source code is modified.
"""
from __future__ import annotations

import time
from collections import defaultdict
from typing import Dict, List

import numpy as np

from evaluation._common import (
    DATASETS_DIR,
    IMAGE_EXTENSIONS,
    ensure_app_importable,
    ensure_results_dir,
    load_image_safely,
    logger,
)

ensure_app_importable()

LATENCY_DATASET_DIR = DATASETS_DIR / "latency"
EXPECTED_LAYOUT = "datasets/latency/<image files> (any images, no ground truth needed)"

DETECTOR_MODEL = "balanced"
SCENE_MODEL = "git"
STORY_TYPES = ["fun_adventure"]  # kept to one type — timing story generation, not variety

STAGES = ["detection", "emotion", "ocr", "scene", "story", "tts", "end_to_end"]


def _find_images() -> List:
    if not LATENCY_DATASET_DIR.exists():
        return []
    return sorted(
        p for p in LATENCY_DATASET_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )


def run_latency_evaluation() -> Dict[str, List[float]] | None:
    from app.services.detection import run_detection
    from app.services.emotion import run_emotion_recognition
    from app.services.ocr import run_ocr
    from app.services.scene import generate_scene_description
    from app.services.story import generate_stories
    from app.services.tts import synthesise_audio

    image_files = _find_images()
    if not image_files:
        print(
            f"\n[evaluate_latency] No images found under {LATENCY_DATASET_DIR}\n"
            f"Expected layout: {EXPECTED_LAYOUT}\n"
            f"See evaluation/README.md for details.\n"
        )
        return None

    timings: Dict[str, List[float]] = defaultdict(list)

    for image_path in image_files:
        image = load_image_safely(image_path)
        if image is None:
            logger.warning("Skipping unreadable image %s", image_path)
            continue

        run_start = time.perf_counter()

        t0 = time.perf_counter()
        detections = run_detection(image, detector_model=DETECTOR_MODEL)
        timings["detection"].append(time.perf_counter() - t0)

        t0 = time.perf_counter()
        emotions = run_emotion_recognition(image, mode="standard", detections=detections)
        timings["emotion"].append(time.perf_counter() - t0)

        t0 = time.perf_counter()
        ocr_result = run_ocr(image, target_language="en")
        timings["ocr"].append(time.perf_counter() - t0)

        t0 = time.perf_counter()
        scene = generate_scene_description(image, scene_model=SCENE_MODEL)
        timings["scene"].append(time.perf_counter() - t0)

        t0 = time.perf_counter()
        stories = generate_stories(detections, emotions, scene, STORY_TYPES, ocr=ocr_result)
        timings["story"].append(time.perf_counter() - t0)

        t0 = time.perf_counter()
        synthesise_audio(stories, lang="en")
        timings["tts"].append(time.perf_counter() - t0)

        timings["end_to_end"].append(time.perf_counter() - run_start)

        logger.info("%-30s end_to_end=%.2fs", image_path.name, timings["end_to_end"][-1])

    return dict(timings)


def save_reports(timings: Dict[str, List[float]]) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import pandas as pd

    results_dir = ensure_results_dir()

    rows = []
    for stage in STAGES:
        values = timings.get(stage, [])
        if not values:
            continue
        arr = np.array(values)
        rows.append(
            {
                "stage": stage,
                "n": len(arr),
                "mean_s": round(float(arr.mean()), 3),
                "median_s": round(float(np.median(arr)), 3),
                "p95_s": round(float(np.percentile(arr, 95)), 3),
                "min_s": round(float(arr.min()), 3),
                "max_s": round(float(arr.max()), 3),
            }
        )

    if not rows:
        logger.error("No timings collected — nothing to report.")
        return

    df = pd.DataFrame(rows)

    print("\n" + "=" * 60)
    print("PIPELINE LATENCY (per stage)")
    print("=" * 60)
    print(df.to_string(index=False))
    print()

    df.to_csv(results_dir / "latency_metrics.csv", index=False)

    plt.figure(figsize=(9, 5))
    x = np.arange(len(df))
    plt.bar(x - 0.2, df["mean_s"], width=0.4, label="mean", color="#22d3ee")
    plt.bar(x + 0.2, df["p95_s"], width=0.4, label="p95", color="#a78bfa")
    plt.xticks(x, df["stage"], rotation=30, ha="right")
    plt.ylabel("Seconds")
    plt.title("Pipeline latency by stage (mean vs p95)")
    plt.legend()
    plt.tight_layout()
    plt.savefig(results_dir / "latency_per_stage.png", dpi=150)
    plt.close()

    print(f"Saved: {results_dir / 'latency_metrics.csv'}")
    print(f"Saved: {results_dir / 'latency_per_stage.png'}")


if __name__ == "__main__":
    outcome = run_latency_evaluation()
    if outcome is not None:
        save_reports(outcome)
