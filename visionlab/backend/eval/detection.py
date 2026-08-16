"""
VisionLab eval — object detection accuracy (mAP), via Ultralytics' own validator.

Evaluates the EXACT weights the app loads (see `MODEL_PATHS` in
app.services.detection) so the numbers reflect the deployed system, not a
stand-in model. mAP is computed by Ultralytics' built-in `DetectionValidator`
— i.e. area under the interpolated precision-recall curve (COCO-style AP),
averaged over classes and, for mAP@0.5:0.95, over ten IoU thresholds. This is
NOT precision * recall.

Run inside the GPU worker container (from repo root):
    docker compose exec worker python -m eval.detection                 # coco128 smoke test (128 imgs, auto-downloaded)
    docker compose exec worker python -m eval.detection --full          # COCO val2017 ONLY (5000 imgs) — the number to report
    docker compose exec worker python -m eval.detection --model-key fast
    docker compose exec worker python -m eval.detection --data my_dataset.yaml   # your own annotated set, see below

--- Your own dataset option ---
If you later annotate your own test images (Roboflow / CVAT / Label Studio,
exported in YOLO format: images/ + labels/ + a data.yaml naming the classes),
just point --data at that yaml instead of coco128.yaml / coco_val.yaml. Nothing
else about this script needs to change — Ultralytics' validator handles any
YOLO-format dataset the same way.

--- Why coco128 isn't the number to report ---
coco128 is a 128-image slice of COCO train2017 — useful as a fast sanity
check that the pipeline works end-to-end, but it's small and may overlap
images the model saw during training. --full switches to COCO val2017 (5000
held-out images), which is what VisionLab's YOLO11 weights are actually
benchmarked against upstream, so that number is directly comparable to
published YOLO11 results.

--- Why --full uses coco_val.yaml, not Ultralytics' coco.yaml ---
Ultralytics' bundled coco.yaml downloads train2017 (~19GB) + val2017 (~1GB) +
test2017 (~7GB) unconditionally, even though validation only ever reads the
val split. eval/coco_val.yaml is the same dataset (same classes/labels) with
the download step trimmed to val2017 only. See that file's header for
details, and `_ensure_coco_val_ready()` below, which downloads the missing
pieces directly (only what's actually missing) before validation starts,
rather than relying on Ultralytics' own auto-download trigger — that trigger
only checks that val2017.txt *exists*, not that the images it lists do, so
an interrupted prior download can leave it satisfied while images are
actually missing.

--- half precision ---
The app runs inference in fp16 on CUDA (see detection.py's `_use_half`), but
validation defaults to fp32 here: fp16 during Ultralytics' validation loop
was empirically found to collapse every metric to 0.0 in this environment
(silently — no error, just zeroed P/R/AP), which is exactly the kind of
wrong-but-plausible-looking number a report shouldn't ship. Pass --half to
try it in your own environment, but sanity-check the output isn't all zero.
"""
from __future__ import annotations

import argparse
import time
from pathlib import Path

import torch
from ultralytics.models.yolo.detect import DetectionValidator

from eval._common import EVAL_DIR, RESULTS_DIR, ensure_app_importable, ensure_results_dir, logger, save_json

ensure_app_importable()

from app.services.detection import MODEL_PATHS  # noqa: E402 — reuse the app's own model registry

DEFAULT_DATA = "coco128.yaml"
FULL_DATA = str(EVAL_DIR / "coco_val.yaml")
DEFAULT_IOU = 0.5
DEFAULT_IMGSZ = 640

# val2017 has exactly 5000 images; treat "most of them present" as "already downloaded".
COCO_VAL_MIN_IMAGES = 4990


def _resolve_device() -> str:
    return "0" if torch.cuda.is_available() else "cpu"


def _ensure_coco_val_ready() -> None:
    """
    Make sure <datasets_dir>/coco has val2017 labels + images before the
    validator runs, downloading only what's actually missing.

    Ultralytics' own auto-download (triggered from inside check_det_dataset,
    called by the validator) only checks that the 'val' path (val2017.txt)
    *exists* — not that the image files it lists exist — so a previously
    interrupted download (e.g. a killed `--full` run, or coco.yaml's
    train/val/test download getting cut off) can leave that check silently
    satisfied while images/val2017/ is empty. Checking and downloading here,
    before the validator starts, sidesteps that and guarantees only
    val2017.zip (not train2017/test2017) ever gets fetched.
    """
    from ultralytics.utils import SETTINGS
    from ultralytics.utils.downloads import download

    coco_dir = Path(SETTINGS["datasets_dir"]) / "coco"
    images_dir = coco_dir / "images"
    val_images_dir = images_dir / "val2017"
    labels_dir = coco_dir / "labels" / "val2017"

    if not labels_dir.exists():
        logger.info("COCO labels not found under %s — downloading coco2017labels-segments.zip.", coco_dir)
        url = "https://github.com/ultralytics/assets/releases/download/v0.0.0/"
        download([url + "coco2017labels-segments.zip"], dir=coco_dir.parent)

    # Stale partial downloads (e.g. from an interrupted run that pulled
    # train/val/test simultaneously) don't count as "downloaded" and just
    # waste disk — clear them before checking/downloading.
    if images_dir.exists():
        for partial in images_dir.glob("*.partial"):
            logger.info("Removing stale partial download: %s", partial)
            partial.unlink(missing_ok=True)

    existing = len(list(val_images_dir.glob("*.jpg"))) if val_images_dir.exists() else 0
    if existing >= COCO_VAL_MIN_IMAGES:
        logger.info("COCO val2017 images already present (%d files) — skipping download.", existing)
        return

    logger.info(
        "COCO val2017 images not found (or incomplete: %d/%d) under %s — "
        "downloading val2017.zip ONLY (~1GB). train2017/test2017 are never touched.",
        existing, COCO_VAL_MIN_IMAGES, val_images_dir,
    )
    download(
        ["http://images.cocodataset.org/zips/val2017.zip"],
        dir=images_dir,
        delete=True,
    )


def run_detection_evaluation(
    model_key: str = "balanced",
    data: str = DEFAULT_DATA,
    iou: float = DEFAULT_IOU,
    imgsz: int = DEFAULT_IMGSZ,
    half: bool = False,
    workers: int = 0,
) -> dict:
    if model_key not in MODEL_PATHS:
        raise SystemExit(f"Unknown --model-key '{model_key}'. Choose from: {sorted(MODEL_PATHS)}")

    weights = MODEL_PATHS[model_key]
    device = _resolve_device()

    if data == FULL_DATA:
        _ensure_coco_val_ready()

    print(
        f"\nEvaluating detector '{model_key}' ({weights}) on data='{data}' "
        f"| device={device} half={half} iou={iou} imgsz={imgsz}\n"
    )

    ensure_results_dir()
    args = dict(
        data=data,
        imgsz=imgsz,
        device=device,
        iou=iou,
        half=half,
        workers=workers,   # avoid multiprocessing dataloader workers exhausting /dev/shm in Docker
        plots=False,
        save_json=False,
        project=str(RESULTS_DIR),
        name=f"detection_{model_key}",
        exist_ok=True,
    )

    t0 = time.time()
    # DetectionValidator (rather than YOLO(...).val()) so we can read
    # validator.seen for the number of images actually evaluated —
    # model.val() discards the validator instance and only returns metrics.
    validator = DetectionValidator(args=args)
    validator(model=weights)
    elapsed_s = time.time() - t0

    box = validator.metrics.box
    result = {
        "component": "detection",
        "model_key": model_key,
        "weights": weights,
        "dataset": data,
        "device": device,
        "half": half,
        "iou": iou,
        "imgsz": imgsz,
        "map50": float(box.map50),
        "map50_95": float(box.map),
        "precision": float(box.mp),
        "recall": float(box.mr),
        "num_images": int(validator.seen),
        "elapsed_s": round(elapsed_s, 1),
    }

    print("\n" + "=" * 60)
    print(f"OBJECT DETECTION — mAP (model={model_key}, weights={weights}, data={data})")
    print("=" * 60)
    print(f"mAP@0.5:      {result['map50']:.3f}")
    print(f"mAP@0.5:0.95: {result['map50_95']:.3f}")
    print(f"Precision:    {result['precision']:.3f}")
    print(f"Recall:       {result['recall']:.3f}")
    print(f"Images evaluated: {result['num_images']}")
    print(f"Elapsed: {result['elapsed_s']}s\n")

    save_json(f"detection_{model_key}", result)
    return result


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--model-key", default="balanced", choices=sorted(MODEL_PATHS),
        help="Which VisionLab detector tier to evaluate (default: balanced, the app's default).",
    )
    parser.add_argument(
        "--data", default=None,
        help=f"Dataset yaml (default: {DEFAULT_DATA}, or {FULL_DATA} with --full). "
             "Point at your own YOLO-format dataset.yaml to use annotated test images instead.",
    )
    parser.add_argument(
        "--full", action="store_true",
        help=f"Evaluate on COCO val2017 ({FULL_DATA}, 5000 imgs) instead of the coco128 smoke test.",
    )
    parser.add_argument("--iou", type=float, default=DEFAULT_IOU, help=f"NMS IoU threshold (default: {DEFAULT_IOU}).")
    parser.add_argument("--imgsz", type=int, default=DEFAULT_IMGSZ, help=f"Inference image size (default: {DEFAULT_IMGSZ}).")
    parser.add_argument("--half", action="store_true", help="Use fp16 validation (see module docstring — verify results aren't all-zero).")
    parser.add_argument("--workers", type=int, default=0, help="Dataloader worker processes (default: 0, safest under Docker's default /dev/shm size).")
    return parser.parse_args()


if __name__ == "__main__":
    ns = _parse_args()
    data = ns.data or (FULL_DATA if ns.full else DEFAULT_DATA)
    run_detection_evaluation(
        model_key=ns.model_key, data=data, iou=ns.iou, imgsz=ns.imgsz, half=ns.half, workers=ns.workers,
    )
