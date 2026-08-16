"""
VisionLab eval — WORD-LEVEL TextOCR evaluation for EasyOCR (the correct protocol for scene text).

The whole-image approach in `eval.ocr_import_textocr` + `eval.ocr --data-dir
eval/data/ocr_textocr` concatenates every word in an image into one string and
scores that against the concatenated ground truth. On scattered scene text
that's dominated by word-ORDER and word-SEGMENTATION mismatch (EasyOCR's
detection order rarely matches TextOCR's reading-order concatenation exactly),
not by how well EasyOCR reads each individual word — it measured CER 0.686 /
31.4% accuracy, most of which is order/segmentation noise rather than
recognition error.

This script scores RECOGNITION QUALITY directly and per-word, which is immune
to ordering/segmentation:
    - Sample individual TextOCR word annotations (not whole images).
    - Crop each word's region out of its source image using the annotation's
      bbox (or, if bbox is missing/degenerate, the axis-aligned bounding box
      of its polygon `points`), with a small pixel pad so glyphs aren't
      clipped at the box edge.
    - Run the app's EasyOCR reader's RECOGNIZER directly on that crop via
      `reader.recognize(crop, detail=0)` with no `horizontal_list`/
      `free_list` — this skips EasyOCR's CRAFT detector entirely and treats
      the whole crop as the one text region to read. This matters: the
      detector is tuned for locating text within full scene images, and
      routinely fails to find anything on a crop that's already nothing but
      one tightly-cropped word with a few px of margin (`reader.readtext()`,
      which runs detect-then-recognize, produced an empty hypothesis on
      >50% of such crops in testing). Since the crop's location is already
      known from the annotation, detection would be redundant work that can
      only hurt recall.
    - Score each word's prediction against its ground truth with
      jiwer.cer, using the exact same normalisation eval.ocr uses so the two
      evaluations are comparable.

Reports both:
    - Character accuracy (1 - corpus-level CER), for comparability with
      eval.ocr's metric.
    - Word accuracy: % of words that came out byte-for-byte correct after
      normalisation — the metric that actually answers "does EasyOCR read
      scene-text words correctly".

This is a separate, additive evaluation. It does not read or modify
eval/data/ocr (the 17-image multilingual set) or eval/data/ocr_textocr /
eval/results/ocr_textocr.json (the whole-image TextOCR run) — it re-derives
word crops on the fly from the same source TextOCR JSON + images that
eval.ocr_import_textocr reads.

Run inside the GPU worker container (from repo root) — eval/*.py is baked
into the image, so rebuild first if this file changed since the last build:
    docker compose build worker && docker compose up -d worker   # wait for warm-up
    docker compose exec worker python -m eval.ocr_textocr_wordlevel --limit 500
"""
from __future__ import annotations

import argparse
import json
import math
import random
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from eval._common import ensure_app_importable, logger, save_json
from eval.ocr import normalize_text
from eval.ocr_import_textocr import (
    ANNOTATIONS_JSON,
    ILLEGIBLE,
    SOURCE_IMAGES_DIR,
    _actual_filename,
)

ensure_app_importable()

RESULT_NAME = "ocr_textocr_wordlevel"
DEFAULT_LIMIT = 500
DEFAULT_SEED = 42
CROP_PADDING_PX = 4
MIN_CROP_SIDE_PX = 4


@dataclass
class WordSample:
    ann_id: str
    image: str
    reference: str
    hypothesis: str
    reference_normalized: str
    hypothesis_normalized: str
    cer: Optional[float]
    correct: bool


@dataclass
class WordLevelResult:
    samples: List[WordSample] = field(default_factory=list)
    considered: int = 0
    skipped_illegible: int = 0
    skipped_missing_image: int = 0
    skipped_bad_box: int = 0
    unreadable_images: int = 0
    elapsed_s: float = 0.0
    case_sensitive: bool = True


def _bbox_from_ann(ann: dict) -> Optional[Tuple[float, float, float, float]]:
    """(x1, y1, x2, y2) from the annotation's `bbox` [x, y, w, h], falling
    back to the axis-aligned bounding box of its polygon `points`."""
    bbox = ann.get("bbox")
    if bbox and len(bbox) == 4:
        x, y, w, h = bbox
        if w > 0 and h > 0:
            return x, y, x + w, y + h

    points = ann.get("points")
    if points and len(points) >= 6:
        xs = points[0::2]
        ys = points[1::2]
        x1, x2 = min(xs), max(xs)
        y1, y2 = min(ys), max(ys)
        if x2 > x1 and y2 > y1:
            return x1, y1, x2, y2

    return None


def _crop_word(image, box: Tuple[float, float, float, float]):
    """Crop *box* out of *image* with a small pad, clamped to image bounds.
    Returns None if the padded/clamped crop is degenerate."""
    width, height = image.size
    x1, y1, x2, y2 = box
    x1 = max(0, int(x1 - CROP_PADDING_PX))
    y1 = max(0, int(y1 - CROP_PADDING_PX))
    x2 = min(width, int(math.ceil(x2 + CROP_PADDING_PX)))
    y2 = min(height, int(math.ceil(y2 + CROP_PADDING_PX)))
    if x2 - x1 < MIN_CROP_SIDE_PX or y2 - y1 < MIN_CROP_SIDE_PX:
        return None
    return image.crop((x1, y1, x2, y2))


def run_word_level_evaluation(limit: int = DEFAULT_LIMIT, seed: int = DEFAULT_SEED, case_sensitive: bool = True) -> Optional[WordLevelResult]:
    from app.services.ocr import _resolve_gpu

    if not ANNOTATIONS_JSON.exists():
        print(f"\n[eval.ocr_textocr_wordlevel] TextOCR annotations not found at {ANNOTATIONS_JSON}\n")
        return None
    if not SOURCE_IMAGES_DIR.exists():
        print(f"\n[eval.ocr_textocr_wordlevel] TextOCR images dir not found at {SOURCE_IMAGES_DIR}\n")
        return None

    import easyocr
    import jiwer
    import numpy as np
    from PIL import Image, UnidentifiedImageError

    logger.info("Loading TextOCR annotations from %s ...", ANNOTATIONS_JSON)
    with open(ANNOTATIONS_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    imgs: Dict[str, dict] = data["imgs"]
    anns: Dict[str, dict] = data["anns"]
    logger.info("Loaded %d images, %d annotations.", len(imgs), len(anns))

    ann_ids = list(anns.keys())
    random.Random(seed).shuffle(ann_ids)

    use_gpu = _resolve_gpu()
    logger.info("Loading EasyOCR reader: langs=('en',) gpu=%s", use_gpu)
    reader = easyocr.Reader(["en"], gpu=use_gpu, verbose=False)

    result = WordLevelResult(case_sensitive=case_sensitive)
    t0 = time.time()

    for ann_id in ann_ids:
        if len(result.samples) >= limit:
            break
        result.considered += 1

        ann = anns[ann_id]
        word = ann.get("utf8_string", "")
        if word == ILLEGIBLE or not word.strip():
            result.skipped_illegible += 1
            continue

        img_meta = imgs.get(ann.get("image_id"))
        if img_meta is None:
            result.skipped_missing_image += 1
            continue

        actual_name = _actual_filename(img_meta["file_name"])
        src_path = SOURCE_IMAGES_DIR / actual_name
        if not src_path.exists():
            result.skipped_missing_image += 1
            continue

        box = _bbox_from_ann(ann)
        if box is None:
            result.skipped_bad_box += 1
            continue

        try:
            image = Image.open(src_path)
            image.load()
            image = image.convert("RGB")
        except (UnidentifiedImageError, OSError) as exc:
            logger.warning("Skipping unreadable image %s: %s", src_path, exc)
            result.unreadable_images += 1
            continue

        crop = _crop_word(image, box)
        if crop is None:
            result.skipped_bad_box += 1
            continue

        img_array = np.asarray(crop)
        try:
            # No horizontal_list/free_list -> recognizer only, no CRAFT
            # detection pass; the whole crop is treated as the text region.
            texts = reader.recognize(img_array, detail=0)
        except Exception as exc:  # noqa: BLE001
            logger.warning("EasyOCR recognize failed on word crop from %s: %s", actual_name, exc)
            texts = []
        hypothesis = " ".join(t for t in texts if t).strip()

        ref_n = normalize_text(word, case_sensitive)
        hyp_n = normalize_text(hypothesis, case_sensitive)
        word_cer = jiwer.cer(ref_n, hyp_n) if ref_n else None

        result.samples.append(WordSample(
            ann_id=ann_id,
            image=actual_name,
            reference=word,
            hypothesis=hypothesis,
            reference_normalized=ref_n,
            hypothesis_normalized=hyp_n,
            cer=word_cer,
            correct=(ref_n == hyp_n),
        ))

    result.elapsed_s = time.time() - t0
    return result


def save_report(result: WordLevelResult) -> dict:
    import jiwer

    if not result.samples:
        logger.error("No words scored. Nothing to report.")
        return {}

    references = [s.reference_normalized for s in result.samples]
    hypotheses = [s.hypothesis_normalized for s in result.samples]

    overall_cer = jiwer.cer(references, hypotheses)
    overall_accuracy = 1.0 - overall_cer
    word_accuracy = sum(1 for s in result.samples if s.correct) / len(result.samples)

    per_word = [
        {
            "ann_id": s.ann_id,
            "image": s.image,
            "reference": s.reference,
            "hypothesis": s.hypothesis,
            "reference_normalized": s.reference_normalized,
            "hypothesis_normalized": s.hypothesis_normalized,
            "cer": s.cer,
            "correct": s.correct,
        }
        for s in result.samples
    ]

    payload = {
        "component": "ocr_word_level",
        "metric": "word_level_character_accuracy",
        "cer": overall_cer,
        "character_accuracy": overall_accuracy,
        "word_accuracy": word_accuracy,
        "num_words_scored": len(result.samples),
        "num_words_considered": result.considered,
        "skipped_illegible": result.skipped_illegible,
        "skipped_missing_image": result.skipped_missing_image,
        "skipped_bad_box": result.skipped_bad_box,
        "unreadable_images": result.unreadable_images,
        "case_sensitive": result.case_sensitive,
        "elapsed_s": round(result.elapsed_s, 1),
        "samples": per_word,
    }

    print("\n" + "=" * 60)
    print("OCR — WORD-LEVEL CHARACTER ACCURACY (1 - CER) + WORD ACCURACY")
    print("=" * 60)
    print(f"Overall CER (word-level):     {overall_cer:.3f}")
    print(f"Character Accuracy:           {overall_accuracy:.3f}")
    print(f"Word Accuracy (exact match):  {word_accuracy:.3f}")
    print(f"Words scored:                 {len(result.samples)}")
    print(f"Words considered:             {result.considered}")
    print(f"Skipped (illegible):          {result.skipped_illegible}")
    print(f"Skipped (missing image):      {result.skipped_missing_image}")
    print(f"Skipped (bad/degenerate box): {result.skipped_bad_box}")
    print(f"Unreadable images:            {result.unreadable_images}")
    print(f"Case-sensitive:               {result.case_sensitive}")
    print(f"Elapsed: {result.elapsed_s:.1f}s")

    print("\nPer-word CER (worst first):")
    print(f"  {'image':<20} {'reference':<24} {'hypothesis':<24} {'CER':>6}")
    for row in sorted(per_word, key=lambda r: (r["cer"] is None, -(r["cer"] or 0.0))):
        cer_str = f"{row['cer']:.3f}" if row["cer"] is not None else "n/a"
        print(f"  {row['image']:<20} {row['reference'][:24]:<24} {row['hypothesis'][:24]:<24} {cer_str:>6}")
    print()

    save_json(RESULT_NAME, payload)
    return payload


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help=f"Number of words to score (default: {DEFAULT_LIMIT}).")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help=f"Random seed for reproducible word sampling (default: {DEFAULT_SEED}).")
    parser.add_argument("--ignore-case", action="store_true", help="Case-insensitive scoring (default: case-sensitive).")
    return parser.parse_args()


if __name__ == "__main__":
    ns = _parse_args()
    outcome = run_word_level_evaluation(limit=ns.limit, seed=ns.seed, case_sensitive=not ns.ignore_case)
    if outcome is not None:
        save_report(outcome)
