"""
VisionLab eval — fill the benchmark table from saved results.

Reads whichever eval/results/*.json files exist (produced by eval.detection,
eval.ocr, eval.emotion) and prints a markdown table of the primary metric
for each component, ready to paste into a report.

Run inside the GPU worker container (from repo root), after running the
individual eval scripts:
    docker compose exec worker python -m eval.summarise
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from eval._common import RESULTS_DIR


def _load(name: str) -> Optional[dict]:
    path = RESULTS_DIR / f"{name}.json"
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _detection_row() -> Optional[tuple[str, str, str, str]]:
    # detection_<model_key>.json — pick whichever tier was most recently evaluated,
    # preferring "balanced" (the app's default) if more than one is present.
    candidates = sorted(RESULTS_DIR.glob("detection_*.json"))
    if not candidates:
        return None
    preferred = RESULTS_DIR / "detection_balanced.json"
    path = preferred if preferred in candidates else candidates[-1]
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    model_desc = f"YOLO11 ({data['weights']}, {data['model_key']})"
    dataset_desc = f"{data['dataset']} ({data['num_images']} imgs)"
    return model_desc, dataset_desc, "mAP@0.5", f"{data['map50']:.3f}"


def _ocr_row() -> Optional[tuple[str, str, str, str]]:
    data = _load("ocr")
    if data is None:
        return None
    return "EasyOCR", f"{data['num_samples']} imgs", "Character Accuracy (1-CER)", f"{data['character_accuracy']:.3f}"


def _emotion_row() -> Optional[tuple[str, str, str, str]]:
    data = _load("emotion")
    if data is None:
        return None
    return "DeepFace", f"{data['num_scored']} imgs", "Macro F1", f"{data['macro_f1']:.3f}"


def build_table() -> str:
    rows = [r for r in (_detection_row(), _ocr_row(), _emotion_row()) if r is not None]
    if not rows:
        return (
            "No results found under eval/results/. Run eval.detection, eval.ocr "
            "and/or eval.emotion first."
        )

    header = "| Component | Dataset Size | Primary Metric | Score |"
    sep = "|---|---|---|---|"
    lines = [header, sep]
    for component, dataset_size, metric, score in rows:
        lines.append(f"| {component} | {dataset_size} | {metric} | {score} |")
    return "\n".join(lines)


if __name__ == "__main__":
    print()
    print(build_table())
    print()
