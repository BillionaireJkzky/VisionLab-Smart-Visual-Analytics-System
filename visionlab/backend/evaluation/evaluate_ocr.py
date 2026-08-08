"""
VisionLab evaluation harness — OCR accuracy (CER / WER).

Calls the project's real `app.services.ocr.run_ocr` against a labelled
test set and reports Character Error Rate, Word Error Rate, and exact-match
accuracy — the standard metrics for text recognition (not precision/recall,
which don't apply to free-text output).

Run from backend/:
    python -m evaluation.evaluate_ocr

Dataset layout expected — image + ground-truth .txt sharing the same stem,
both directly under datasets/ocr/:
    evaluation/datasets/ocr/receipt001.jpg
    evaluation/datasets/ocr/receipt001.txt   <- exact expected text, UTF-8
    evaluation/datasets/ocr/sign002.png
    evaluation/datasets/ocr/sign002.txt
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
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

OCR_DATASET_DIR = DATASETS_DIR / "ocr"
EXPECTED_LAYOUT = "datasets/ocr/<name>.<jpg|png|...> paired with datasets/ocr/<name>.txt (ground truth)"


@dataclass
class OcrPair:
    image_path: object
    reference: str
    hypothesis: str = ""


@dataclass
class OcrEvalResult:
    pairs: List[OcrPair] = field(default_factory=list)
    no_ground_truth_count: int = 0
    unreadable_count: int = 0
    elapsed_s: float = 0.0


def _find_pairs():
    if not OCR_DATASET_DIR.exists():
        return []
    image_files = sorted(
        p for p in OCR_DATASET_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )
    return image_files


def run_ocr_evaluation() -> OcrEvalResult | None:
    from app.services.ocr import run_ocr

    image_files = _find_pairs()
    if not image_files:
        print(
            f"\n[evaluate_ocr] No images found under {OCR_DATASET_DIR}\n"
            f"Expected layout: {EXPECTED_LAYOUT}\n"
            f"See evaluation/README.md for where to download a suitable dataset.\n"
        )
        return None

    result = OcrEvalResult()
    t0 = time.time()

    for image_path in image_files:
        gt_path = image_path.with_suffix(".txt")
        if not gt_path.exists():
            logger.warning("No ground-truth .txt for %s — skipping.", image_path.name)
            result.no_ground_truth_count += 1
            continue

        reference = gt_path.read_text(encoding="utf-8").strip()

        image = load_image_safely(image_path)
        if image is None:
            result.unreadable_count += 1
            continue

        ocr_output = run_ocr(image, target_language="en")
        hypothesis = (ocr_output.get("raw_text") or "").strip()

        pair = OcrPair(image_path=image_path, reference=reference, hypothesis=hypothesis)
        result.pairs.append(pair)
        logger.info("%-30s ref=%r  hyp=%r", image_path.name, reference[:40], hypothesis[:40])

    result.elapsed_s = time.time() - t0
    return result


def save_reports(result: OcrEvalResult) -> None:
    import jiwer
    import pandas as pd

    results_dir = ensure_results_dir()

    if not result.pairs:
        logger.error("No scoreable image/ground-truth pairs found. Nothing to report.")
        return

    references = [p.reference for p in result.pairs]
    hypotheses = [p.hypothesis for p in result.pairs]

    # Corpus-level CER/WER (jiwer aggregates edit distance across the whole
    # set, which is the standard way to report these — not a naive mean of
    # per-sample rates, which over-weights short ground-truth strings).
    corpus_cer = jiwer.cer(references, hypotheses)
    corpus_wer = jiwer.wer(references, hypotheses)

    exact_matches = sum(1 for p in result.pairs if p.reference == p.hypothesis)
    exact_match_accuracy = exact_matches / len(result.pairs)

    print("\n" + "=" * 60)
    print("OCR — CHARACTER / WORD ERROR RATE")
    print("=" * 60)
    print(f"Character Error Rate (CER): {corpus_cer:.3f}")
    print(f"Word Error Rate (WER):      {corpus_wer:.3f}")
    print(f"Exact-match accuracy:       {exact_match_accuracy:.3f} ({exact_matches}/{len(result.pairs)})")
    print(f"Pairs scored: {len(result.pairs)}")
    print(f"Missing ground truth: {result.no_ground_truth_count}")
    print(f"Unreadable images:    {result.unreadable_count}")
    print(f"Elapsed: {result.elapsed_s:.1f}s\n")

    per_image_rows = []
    for p in result.pairs:
        per_image_rows.append(
            {
                "image": p.image_path.name,
                "reference": p.reference,
                "hypothesis": p.hypothesis,
                "cer": jiwer.cer(p.reference, p.hypothesis) if p.reference else None,
                "wer": jiwer.wer(p.reference, p.hypothesis) if p.reference else None,
                "exact_match": p.reference == p.hypothesis,
            }
        )
    per_image_rows.append(
        {
            "image": "OVERALL (corpus-level)",
            "reference": "",
            "hypothesis": "",
            "cer": corpus_cer,
            "wer": corpus_wer,
            "exact_match": exact_match_accuracy,
        }
    )

    df = pd.DataFrame(per_image_rows)
    df.to_csv(results_dir / "ocr_metrics.csv", index=False)
    print(f"Saved: {results_dir / 'ocr_metrics.csv'}")


if __name__ == "__main__":
    outcome = run_ocr_evaluation()
    if outcome is not None:
        save_reports(outcome)
