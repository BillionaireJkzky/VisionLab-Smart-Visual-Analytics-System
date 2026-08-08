"""
VisionLab evaluation harness — object detection accuracy (mAP).

Calls the project's real `app.services.detection.run_detection` against a
COCO-annotated test set and reports mAP@0.5, mAP@0.5:0.95, and per-class
AP@0.5 — the standard metrics for object detection (not precision/recall/F1,
which don't apply cleanly to a localisation + classification task).

Run from backend/:
    python -m evaluation.evaluate_detection

Dataset layout expected (standard COCO format):
    evaluation/datasets/detection/images/<image files>
    evaluation/datasets/detection/annotations.json

annotations.json must be a COCO-format JSON with "images", "annotations",
and "categories" keys (this is exactly what COCO val2017 / any COCO-format
export from Roboflow, CVAT, etc. produces).

--- Why no pycocotools ---
pycocotools needs a C build step that is unreliable on Windows without
Visual C++ build tools. The AP algorithm below reimplements the same
method COCOeval uses (IoU-matched greedy assignment + 101-point
interpolated precision-recall AP, averaged over IoU thresholds
0.50:0.05:0.95 for mAP@0.5:0.95), just in plain numpy, so results are
directly comparable to literature numbers computed with pycocotools.
"""
from __future__ import annotations

import csv
import json
import time
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np

from evaluation._common import (
    DATASETS_DIR,
    ensure_app_importable,
    ensure_results_dir,
    load_image_safely,
    logger,
)

ensure_app_importable()

DETECTION_DATASET_DIR = DATASETS_DIR / "detection"
IMAGES_DIR = DETECTION_DATASET_DIR / "images"
ANNOTATIONS_PATH = DETECTION_DATASET_DIR / "annotations.json"
EXPECTED_LAYOUT = "datasets/detection/images/<files> + datasets/detection/annotations.json (COCO format)"

# Low confidence floor so mAP sees the full precision-recall curve, not just
# the app's default UI threshold (0.25). This does NOT change app behaviour —
# it's a parameter passed to the same run_detection() the app calls.
EVAL_MIN_CONF = 0.001

# COCO's official mAP@0.5:0.95 averages AP over these 10 IoU thresholds.
IOU_THRESHOLDS = np.round(np.arange(0.50, 1.00, 0.05), 2)

DETECTOR_MODEL = "balanced"  # which VisionLab detector tier to evaluate; change as needed


BBox = Tuple[float, float, float, float]  # x1, y1, x2, y2


@dataclass
class GroundTruth:
    image_id: int
    file_name: str
    class_name: str
    bbox: BBox


@dataclass
class Prediction:
    image_id: int
    class_name: str
    confidence: float
    bbox: BBox


def _load_coco_annotations() -> Tuple[Dict[int, str], List[GroundTruth]]:
    with open(ANNOTATIONS_PATH, "r", encoding="utf-8") as f:
        coco = json.load(f)

    images_by_id = {img["id"]: img["file_name"] for img in coco["images"]}
    categories_by_id = {cat["id"]: cat["name"] for cat in coco["categories"]}

    ground_truths: List[GroundTruth] = []
    for ann in coco["annotations"]:
        image_id = ann["image_id"]
        if image_id not in images_by_id:
            continue
        category_name = categories_by_id.get(ann["category_id"])
        if category_name is None:
            continue
        x, y, w, h = ann["bbox"]  # COCO format is [x, y, width, height]
        ground_truths.append(
            GroundTruth(
                image_id=image_id,
                file_name=images_by_id[image_id],
                class_name=category_name,
                bbox=(x, y, x + w, y + h),
            )
        )
    return images_by_id, ground_truths


def _run_predictions(images_by_id: Dict[int, str]) -> Tuple[List[Prediction], int, int]:
    from app.services.detection import run_detection

    predictions: List[Prediction] = []
    unreadable_count = 0
    processed_count = 0

    for image_id, file_name in images_by_id.items():
        image_path = IMAGES_DIR / file_name
        image = load_image_safely(image_path)
        if image is None:
            unreadable_count += 1
            continue

        processed_count += 1
        detections = run_detection(image, detector_model=DETECTOR_MODEL, min_conf=EVAL_MIN_CONF)
        for det in detections:
            x1, y1, x2, y2 = det["bounding_box"]
            predictions.append(
                Prediction(
                    image_id=image_id,
                    class_name=det["label"],
                    confidence=det["confidence"],
                    bbox=(x1, y1, x2, y2),
                )
            )
        logger.info("%s -> %d detection(s)", file_name, len(detections))

    return predictions, processed_count, unreadable_count


def _iou(box_a: BBox, box_b: BBox) -> float:
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b

    inter_x1, inter_y1 = max(ax1, bx1), max(ay1, by1)
    inter_x2, inter_y2 = min(ax2, bx2), min(ay2, by2)
    inter_w, inter_h = max(0.0, inter_x2 - inter_x1), max(0.0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter_area
    return inter_area / union if union > 0 else 0.0


def _ap_101_point(recalls: np.ndarray, precisions: np.ndarray) -> float:
    """COCO's 101-point interpolated AP: precision envelope (max precision
    at recall >= r), sampled at r = 0, 0.01, ..., 1.0, then averaged."""
    if len(recalls) == 0:
        return 0.0

    # Precision envelope: make precision monotonically non-increasing as recall grows.
    for i in range(len(precisions) - 2, -1, -1):
        precisions[i] = max(precisions[i], precisions[i + 1])

    recall_points = np.linspace(0, 1, 101)
    interpolated = np.zeros(101)
    for i, r in enumerate(recall_points):
        idx = np.searchsorted(recalls, r, side="left")
        if idx < len(precisions):
            interpolated[i] = precisions[idx:].max() if idx < len(precisions) else 0.0
    return float(interpolated.mean())


def _average_precision_for_class(
    class_gts: Dict[int, List[BBox]],
    class_preds: List[Prediction],
    iou_threshold: float,
) -> float:
    total_gt = sum(len(boxes) for boxes in class_gts.values())
    if total_gt == 0:
        return 0.0  # no ground truth for this class at all — undefined, treated as 0

    matched = {image_id: np.zeros(len(boxes), dtype=bool) for image_id, boxes in class_gts.items()}
    preds_sorted = sorted(class_preds, key=lambda p: p.confidence, reverse=True)

    tp = np.zeros(len(preds_sorted))
    fp = np.zeros(len(preds_sorted))

    for i, pred in enumerate(preds_sorted):
        gt_boxes = class_gts.get(pred.image_id, [])
        if not gt_boxes:
            fp[i] = 1
            continue

        ious = [_iou(pred.bbox, gt_box) for gt_box in gt_boxes]
        best_idx = int(np.argmax(ious))
        best_iou = ious[best_idx]

        if best_iou >= iou_threshold and not matched[pred.image_id][best_idx]:
            tp[i] = 1
            matched[pred.image_id][best_idx] = True
        else:
            fp[i] = 1

    tp_cumsum = np.cumsum(tp)
    fp_cumsum = np.cumsum(fp)
    recalls = tp_cumsum / total_gt
    precisions = tp_cumsum / np.maximum(tp_cumsum + fp_cumsum, np.finfo(np.float64).eps)

    return _ap_101_point(recalls, precisions)


def compute_map(
    ground_truths: List[GroundTruth], predictions: List[Prediction]
) -> Tuple[Dict[str, Dict[str, float]], float, float]:
    """Returns (per_class_ap[class][iou_str], mAP@0.5, mAP@0.5:0.95)."""
    class_names = sorted({gt.class_name for gt in ground_truths} | {p.class_name for p in predictions})

    gts_by_class: Dict[str, Dict[int, List[BBox]]] = {c: defaultdict(list) for c in class_names}
    for gt in ground_truths:
        gts_by_class[gt.class_name][gt.image_id].append(gt.bbox)

    preds_by_class: Dict[str, List[Prediction]] = {c: [] for c in class_names}
    for pred in predictions:
        if pred.class_name in preds_by_class:
            preds_by_class[pred.class_name].append(pred)

    per_class_ap: Dict[str, Dict[str, float]] = {c: {} for c in class_names}
    for class_name in class_names:
        for iou_thr in IOU_THRESHOLDS:
            ap = _average_precision_for_class(
                gts_by_class[class_name], preds_by_class[class_name], float(iou_thr)
            )
            per_class_ap[class_name][f"AP@{iou_thr:.2f}"] = ap

    ap_at_50 = [per_class_ap[c]["AP@0.50"] for c in class_names]
    map_50 = float(np.mean(ap_at_50)) if ap_at_50 else 0.0

    ap_all = [v for c in class_names for v in per_class_ap[c].values()]
    map_50_95 = float(np.mean(ap_all)) if ap_all else 0.0

    return per_class_ap, map_50, map_50_95


def save_reports(
    per_class_ap: Dict[str, Dict[str, float]],
    map_50: float,
    map_50_95: float,
    processed_count: int,
    unreadable_count: int,
    elapsed_s: float,
) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import pandas as pd

    results_dir = ensure_results_dir()

    print("\n" + "=" * 60)
    print(f"OBJECT DETECTION — mAP (model={DETECTOR_MODEL})")
    print("=" * 60)
    print(f"mAP@0.5:      {map_50:.3f}")
    print(f"mAP@0.5:0.95: {map_50_95:.3f}")
    print(f"Images evaluated: {processed_count} (unreadable: {unreadable_count})")
    print(f"Elapsed: {elapsed_s:.1f}s\n")

    rows = []
    for class_name, ap_dict in sorted(per_class_ap.items()):
        row = {"class": class_name, "AP@0.5": ap_dict["AP@0.50"]}
        row["AP@0.5:0.95"] = float(np.mean(list(ap_dict.values())))
        rows.append(row)
    rows.append({"class": "mAP (all classes)", "AP@0.5": map_50, "AP@0.5:0.95": map_50_95})

    df = pd.DataFrame(rows)
    df.to_csv(results_dir / "detection_metrics.csv", index=False)
    print(df.to_string(index=False))

    class_rows = [r for r in rows if r["class"] != "mAP (all classes)"]
    if class_rows:
        plt.figure(figsize=(max(6, len(class_rows) * 0.6), 5))
        plt.bar([r["class"] for r in class_rows], [r["AP@0.5"] for r in class_rows], color="#22d3ee")
        plt.axhline(map_50, color="#a78bfa", linestyle="--", label=f"mAP@0.5 = {map_50:.3f}")
        plt.xticks(rotation=60, ha="right")
        plt.ylabel("AP@0.5")
        plt.title(f"Per-class AP@0.5 — VisionLab detector ({DETECTOR_MODEL})")
        plt.legend()
        plt.tight_layout()
        plt.savefig(results_dir / "detection_ap_per_class.png", dpi=150)
        plt.close()

    print(f"\nSaved: {results_dir / 'detection_metrics.csv'}")
    print(f"Saved: {results_dir / 'detection_ap_per_class.png'}")


def run_detection_evaluation() -> None:
    if not ANNOTATIONS_PATH.exists():
        print(
            f"\n[evaluate_detection] No annotations file found at {ANNOTATIONS_PATH}\n"
            f"Expected layout: {EXPECTED_LAYOUT}\n"
            f"See evaluation/README.md for where to download a suitable dataset.\n"
        )
        return
    if not IMAGES_DIR.exists() or not any(IMAGES_DIR.iterdir()):
        print(f"\n[evaluate_detection] No images found under {IMAGES_DIR}\n")
        return

    t0 = time.time()
    images_by_id, ground_truths = _load_coco_annotations()
    predictions, processed_count, unreadable_count = _run_predictions(images_by_id)
    per_class_ap, map_50, map_50_95 = compute_map(ground_truths, predictions)
    elapsed_s = time.time() - t0

    save_reports(per_class_ap, map_50, map_50_95, processed_count, unreadable_count, elapsed_s)


if __name__ == "__main__":
    run_detection_evaluation()
