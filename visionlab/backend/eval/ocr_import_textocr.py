"""
VisionLab eval — import a subset of TextOCR into a SEPARATE eval dataset.

Builds eval/data/ocr_textocr/ (images/ + ground_truth.csv) from the
downloaded TextOCR train set, for a robust, citable English Character
Accuracy on full scene-text images. This is independent of the hand-labelled
multilingual set in eval/data/ocr/ — nothing there is read or modified.

Source data (already present under eval/data/ocr/, not touched):
    eval/data/ocr/TextOCR_0.1_train.json               COCO-style annotations
    eval/data/ocr/train_val_images/train_images/*.jpg   ~25,119 images

TextOCR JSON shape:
    imgs      {img_id: {id, width, height, set, file_name}}   file_name is
              like "train/xxxx.jpg" — only the basename exists under
              train_images/, so it's remapped per image.
    anns      {ann_id: {id, image_id, bbox, utf8_string, points, area}}
              `points` is a flat [x1,y1,x2,y2,x3,y3,x4,y4] quad.
    imgToAnns {img_id: [ann_id, ...]}

Illegible words have utf8_string == "." — dropped, never joined into the
ground truth. Kept words are ordered into reading order with the exact same
centroid sort (top-to-bottom, then left-to-right) eval.ocr applies to
EasyOCR's own detections (`eval.ocr.join_in_reading_order`, reused directly
here so the two datasets are scored the same way), then joined with single
spaces into one ground-truth string per image.

Run inside the GPU worker container (from repo root) — after rebuilding, see
eval/ocr.py's module docstring for why a rebuild is required:
    docker compose exec worker python -m eval.ocr_import_textocr --limit 300

Then score it without touching the 17-image multilingual set:
    docker compose exec worker python -m eval.ocr --data-dir /app/eval/data/ocr_textocr
"""
from __future__ import annotations

import argparse
import csv
import json
import random
import shutil
from pathlib import Path
from typing import Dict, List, Tuple

from eval._common import DATA_DIR, ensure_app_importable, logger
from eval.ocr import join_in_reading_order

ensure_app_importable()

SOURCE_DIR = DATA_DIR / "ocr"
ANNOTATIONS_JSON = SOURCE_DIR / "TextOCR_0.1_train.json"
SOURCE_IMAGES_DIR = SOURCE_DIR / "train_val_images" / "train_images"

OUTPUT_DIR = DATA_DIR / "ocr_textocr"
OUTPUT_IMAGES_DIR = OUTPUT_DIR / "images"
OUTPUT_CSV = OUTPUT_DIR / "ground_truth.csv"

ILLEGIBLE = "."
DEFAULT_LIMIT = 300
DEFAULT_SEED = 42


def _points_to_box(points: List[float]) -> List[List[float]]:
    """Flat [x1,y1,x2,y2,...] -> [[x1,y1],[x2,y2],...] — the box shape
    eval.ocr._reading_order_key (via join_in_reading_order) expects."""
    return [[points[i], points[i + 1]] for i in range(0, len(points) - 1, 2)]


def _ground_truth_text(anns: Dict[str, dict], ann_ids: List[str]) -> str:
    """Kept (legible) words for one image, joined in reading order."""
    detections = []
    for ann_id in ann_ids:
        ann = anns[ann_id]
        text = ann.get("utf8_string", "")
        if text == ILLEGIBLE or not text.strip():
            continue
        points = ann.get("points")
        if not points or len(points) < 6:
            continue
        detections.append((_points_to_box(points), text, None))
    if not detections:
        return ""
    return join_in_reading_order(detections)


def _actual_filename(file_name: str) -> str:
    """TextOCR's file_name carries a "train/" prefix; the real file under
    train_images/ is just the basename."""
    return Path(file_name).name


def import_textocr(limit: int = DEFAULT_LIMIT, seed: int = DEFAULT_SEED) -> None:
    if not ANNOTATIONS_JSON.exists():
        raise FileNotFoundError(f"TextOCR annotations not found at {ANNOTATIONS_JSON}")
    if not SOURCE_IMAGES_DIR.exists():
        raise FileNotFoundError(f"TextOCR images dir not found at {SOURCE_IMAGES_DIR}")

    logger.info("Loading TextOCR annotations from %s ...", ANNOTATIONS_JSON)
    with open(ANNOTATIONS_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    imgs = data["imgs"]
    anns = data["anns"]
    img_to_anns = data["imgToAnns"]
    logger.info("Loaded %d images, %d annotations.", len(imgs), len(anns))

    img_ids = list(imgs.keys())
    random.Random(seed).shuffle(img_ids)

    OUTPUT_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    rows: List[Tuple[str, str, str]] = []
    considered = 0
    missing_file = 0
    empty_text = 0

    for img_id in img_ids:
        if len(rows) >= limit:
            break
        considered += 1

        actual_name = _actual_filename(imgs[img_id]["file_name"])
        src_path = SOURCE_IMAGES_DIR / actual_name
        if not src_path.exists():
            missing_file += 1
            continue

        text = _ground_truth_text(anns, img_to_anns.get(img_id, []))
        if not text.strip():
            empty_text += 1
            continue

        shutil.copyfile(src_path, OUTPUT_IMAGES_DIR / actual_name)
        rows.append((actual_name, "en", text))

    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_ALL)
        writer.writerow(["image", "lang", "text"])
        writer.writerows(rows)

    print("\n" + "-" * 60)
    print("TextOCR import")
    print("-" * 60)
    print(f"Images considered:        {considered}")
    print(f"Skipped (missing file):   {missing_file}")
    print(f"Skipped (empty text):     {empty_text}")
    print(f"Imported:                 {len(rows)}")
    print(f"Images dir:    {OUTPUT_IMAGES_DIR}")
    print(f"Ground truth:  {OUTPUT_CSV}")
    print()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help=f"Number of images to import (default: {DEFAULT_LIMIT}).")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help=f"Random seed for reproducible sampling (default: {DEFAULT_SEED}).")
    return parser.parse_args()


if __name__ == "__main__":
    ns = _parse_args()
    import_textocr(limit=ns.limit, seed=ns.seed)
