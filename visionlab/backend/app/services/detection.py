"""
VisionLab — Multi-Model Object Detection Service (Optimised).

Performance changes from the previous version:
1. Top-level imports for `torch` and `ultralytics.YOLO` so the libraries are
   only loaded once at worker startup, not on every request.
2. Eager model warm-up via `warmup_models()` — call this at Celery worker
   boot. The first real request no longer pays the JIT/load tax.
3. Image is resized to a max edge of 640 px before inference. YOLO is trained
   at 640, so larger images give no accuracy gain, only latency.
4. Half precision (fp16) is used automatically when CUDA is available.
5. Inference runs with `torch.inference_mode()` — disables gradient tracking,
   which is faster than just `verbose=False` on CPU.

Three selectable detection tiers:
- fast      -> yolo11n.pt
- balanced  -> yolo11s.pt
- advanced  ->  yolo11s.pt
"""
from __future__ import annotations

import logging
from typing import Dict, List

import numpy as np
import torch
from PIL import Image
from ultralytics import YOLO

logger = logging.getLogger(__name__)

MODEL_PATHS = {
    "fast": "yolo11n.pt",
    "balanced": "yolo11s.pt",
    "advanced": "yolo11s.pt",
}

# Resize hint for YOLO — 640 is the training size; larger doesn't help accuracy.
INFERENCE_IMG_SIZE = 640

_models: Dict[str, YOLO] = {}
_device: str | None = None
_use_half: bool = False


def _resolve_device() -> str:
    global _device, _use_half
    if _device is not None:
        return _device

    if torch.cuda.is_available():
        _device = "cuda"
        _use_half = True
        # Images are always resized to a fixed INFERENCE_IMG_SIZE before inference,
        # so cuDNN's autotuner can safely cache the fastest conv algorithms for that
        # shape instead of re-searching per call. No effect on output/accuracy.
        torch.backends.cudnn.benchmark = True
    else:
        _device = "cpu"
        _use_half = False

    logger.info("Detection service device: %s (half=%s)", _device, _use_half)
    return _device


def _normalize_model_key(model_key: str) -> str:
    if model_key not in MODEL_PATHS:
        logger.warning("Unknown detector model '%s'. Falling back to 'balanced'.", model_key)
        return "balanced"
    return model_key


def _get_model(model_key: str = "balanced") -> YOLO:
    model_key = _normalize_model_key(model_key)

    if model_key in _models:
        return _models[model_key]

    device = _resolve_device()
    model_path = MODEL_PATHS[model_key]

    model = YOLO(model_path)
    model.to(device)

    # fp16 is requested per-call via `half=` on predict() instead of converting
    # weights here — calling model.model.half() before Ultralytics fuses
    # Conv+BatchNorm on first inference causes a dtype mismatch crash
    # (fused conv ends up half while its batchnorm buffers are still float32).

    _models[model_key] = model
    logger.info("Detection model loaded: %s (%s) on %s", model_key, model_path, device)
    return model


def warmup_models(keys: List[str] | None = None) -> None:
    keys = keys or ["fast", "balanced"]
    dummy = np.zeros((INFERENCE_IMG_SIZE, INFERENCE_IMG_SIZE, 3), dtype=np.uint8)
    for key in keys:
        model = _get_model(key)
        try:
            with torch.inference_mode():
                model(dummy, imgsz=INFERENCE_IMG_SIZE, verbose=False, half=_use_half)
            logger.info("Warmed up detection model: %s", key)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Warm-up failed for %s: %s", key, exc)


def _resize_for_inference(image: Image.Image) -> Image.Image:
    w, h = image.size
    long_edge = max(w, h)
    if long_edge <= INFERENCE_IMG_SIZE:
        return image

    scale = INFERENCE_IMG_SIZE / long_edge
    new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
    return image.resize(new_size, Image.BILINEAR)


def _location_descriptor(
    x1: float, y1: float, x2: float, y2: float, img_w: int, img_h: int
) -> str:
    cx = (x1 + x2) / 2 / img_w
    cy = (y1 + y2) / 2 / img_h

    v = "top" if cy < 0.33 else ("bottom" if cy > 0.66 else "middle")
    h = "left" if cx < 0.33 else ("right" if cx > 0.66 else "centre")

    if v == "middle" and h == "centre":
        return "centre of the image"
    if v == "middle":
        return f"{h} side"
    if h == "centre":
        return f"{v} of the image"
    return f"{v}-{h}"


def run_detection(
    image: Image.Image,
    detector_model: str = "balanced",
    min_conf: float = 0.25,
) -> List[dict]:
    model_key = _normalize_model_key(detector_model)
    model = _get_model(model_key)

    rgb = image.convert("RGB")
    orig_w, orig_h = rgb.size

    resized = _resize_for_inference(rgb)
    resized_w, resized_h = resized.size
    scale_x = orig_w / resized_w
    scale_y = orig_h / resized_h

    img_array = np.asarray(resized)

    with torch.inference_mode():
        results = model(
            img_array,
            imgsz=INFERENCE_IMG_SIZE,
            verbose=False,
            half=_use_half,
            conf=min_conf,
        )

    detections: List[dict] = []

    for result in results:
        boxes = result.boxes
        if boxes is None:
            continue

        for box in boxes:
            xyxy = box.xyxy[0].tolist()
            x1, y1, x2, y2 = xyxy

            # Map back to the original image so annotation lines up.
            x1 *= scale_x
            x2 *= scale_x
            y1 *= scale_y
            y2 *= scale_y

            conf = float(box.conf[0])
            cls_id = int(box.cls[0])
            label = model.names[cls_id]

            detections.append(
                {
                    "label": label,
                    "confidence": round(conf, 4),
                    "bounding_box": [round(v, 2) for v in [x1, y1, x2, y2]],
                    "location": _location_descriptor(x1, y1, x2, y2, orig_w, orig_h),
                    "model": model_key,
                }
            )

    logger.debug(
        "Detected %d objects using model '%s' (resized %dx%d -> %dx%d).",
        len(detections), model_key, orig_w, orig_h, resized_w, resized_h,
    )
    return detections
