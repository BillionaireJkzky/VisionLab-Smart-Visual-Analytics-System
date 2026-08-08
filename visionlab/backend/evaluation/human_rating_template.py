"""
VisionLab evaluation harness — human rating sheet for scene/story quality.

Scene description and story generation produce free text, so there's no
automatic ground-truth to score against — accuracy/F1/CER all don't apply.
The honest way to evaluate them is a small human rating exercise: generate
real outputs from the actual pipeline, have people (you, or a few adults)
score each on a 1-5 scale, then report the average and standard deviation.

Run from backend/:
    python -m evaluation.human_rating_template generate
        -> runs the real scene + story services over your images and
           writes results/human_rating_sheet.csv with blank rating columns

    (open the CSV, fill in rating_1_to_5 for each row — 1 = poor, 5 = excellent
     — and optionally notes, then:)

    python -m evaluation.human_rating_template report
        -> reads the filled-in CSV back and prints/saves the average rating
           and standard deviation per module (scene vs story)

Dataset layout expected:
    evaluation/datasets/human_rating/<image files>
"""
from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import List

from evaluation._common import (
    DATASETS_DIR,
    IMAGE_EXTENSIONS,
    ensure_app_importable,
    ensure_results_dir,
    load_image_safely,
    logger,
)

ensure_app_importable()

RATING_DATASET_DIR = DATASETS_DIR / "human_rating"
SHEET_PATH_NAME = "human_rating_sheet.csv"
REPORT_PATH_NAME = "human_rating_report.csv"
EXPECTED_LAYOUT = "datasets/human_rating/<image files>"

CSV_FIELDS = ["image_id", "module", "output_text", "rating_1_to_5", "notes"]

DETECTOR_MODEL = "balanced"
SCENE_MODEL = "git"
STORY_TYPES = ["fun_adventure", "educational"]


def _find_images() -> List[Path]:
    if not RATING_DATASET_DIR.exists():
        return []
    return sorted(
        p for p in RATING_DATASET_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )


def generate_rating_sheet() -> None:
    from app.services.detection import run_detection
    from app.services.emotion import run_emotion_recognition
    from app.services.ocr import run_ocr
    from app.services.scene import generate_scene_description
    from app.services.story import generate_stories

    image_files = _find_images()
    if not image_files:
        print(
            f"\n[human_rating_template] No images found under {RATING_DATASET_DIR}\n"
            f"Expected layout: {EXPECTED_LAYOUT}\n"
        )
        return

    results_dir = ensure_results_dir()
    sheet_path = results_dir / SHEET_PATH_NAME
    rows = []

    for image_path in image_files:
        image = load_image_safely(image_path)
        if image is None:
            logger.warning("Skipping unreadable image %s", image_path)
            continue

        detections = run_detection(image, detector_model=DETECTOR_MODEL)
        emotions = run_emotion_recognition(image, mode="standard", detections=detections)
        ocr_result = run_ocr(image, target_language="en")
        scene = generate_scene_description(image, scene_model=SCENE_MODEL)

        rows.append(
            {
                "image_id": image_path.name,
                "module": "scene",
                "output_text": scene.get("description", ""),
                "rating_1_to_5": "",
                "notes": "",
            }
        )

        stories = generate_stories(detections, emotions, scene, STORY_TYPES, ocr=ocr_result)
        for story in stories:
            rows.append(
                {
                    "image_id": image_path.name,
                    "module": f"story:{story.get('story_type', 'unknown')}",
                    "output_text": story.get("content", ""),
                    "rating_1_to_5": "",
                    "notes": "",
                }
            )

        logger.info("Generated scene + %d stor(y/ies) for %s", len(stories), image_path.name)

    with open(sheet_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nWrote {len(rows)} rows to {sheet_path}")
    print("Open it, fill in rating_1_to_5 (1-5) for each row, then run:")
    print("    python -m evaluation.human_rating_template report\n")


def report_ratings() -> None:
    import numpy as np
    import pandas as pd

    results_dir = ensure_results_dir()
    sheet_path = results_dir / SHEET_PATH_NAME

    if not sheet_path.exists():
        print(
            f"\n[human_rating_template] {sheet_path} does not exist yet.\n"
            f"Run `python -m evaluation.human_rating_template generate` first.\n"
        )
        return

    df = pd.read_csv(sheet_path)
    df["rating_1_to_5"] = pd.to_numeric(df["rating_1_to_5"], errors="coerce")

    rated = df.dropna(subset=["rating_1_to_5"])
    unrated_count = len(df) - len(rated)

    if rated.empty:
        print(
            f"\n[human_rating_template] No filled-in ratings found in {sheet_path}.\n"
            f"Fill in the rating_1_to_5 column (1-5) for at least a few rows first.\n"
        )
        return

    summary = rated.groupby("module")["rating_1_to_5"].agg(["mean", "std", "count"]).reset_index()
    summary.columns = ["module", "mean_rating", "std_rating", "n_ratings"]

    print("\n" + "=" * 60)
    print("HUMAN RATING REPORT")
    print("=" * 60)
    print(summary.to_string(index=False))
    print(f"\nTotal rated rows:   {len(rated)}")
    print(f"Total unrated rows: {unrated_count} (excluded from averages)")

    report_path = results_dir / REPORT_PATH_NAME
    summary.to_csv(report_path, index=False)
    print(f"\nSaved: {report_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["generate", "report"], help="generate the sheet, or report on filled-in ratings")
    args = parser.parse_args()

    if args.command == "generate":
        generate_rating_sheet()
    else:
        report_ratings()


if __name__ == "__main__":
    main()
