"""
Benchmark the VisionLab pipeline steps against a real image, inside the
worker's own environment (so device placement and warm-model timings match
what a real Celery task actually sees).

Usage (run inside the worker container):
    docker compose exec worker python -m app.scripts.benchmark <image_path>
    docker compose exec worker python -m app.scripts.benchmark  # uses a bundled sample image

Two phases:
  1. Device placement report — is each model actually running on GPU?
  2. Per-step timing — cold model load, then warm (steady-state) inference.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

from PIL import Image

_FALLBACK_IMAGE = Path(
    "/usr/local/lib/python3.11/site-packages/ultralytics/assets/bus.jpg"
)


def _timed(label: str, fn, *a, **kw):
    t0 = time.perf_counter()
    result = fn(*a, **kw)
    dt = time.perf_counter() - t0
    print(f"  {label:<50s} {dt:8.3f}s")
    return result, dt


def _report_devices() -> None:
    print("=" * 70)
    print("DEVICE PLACEMENT")
    print("=" * 70)

    import torch
    cuda_ok = torch.cuda.is_available()
    print(f"torch.cuda.is_available(): {cuda_ok}")
    if cuda_ok:
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    import tensorflow as tf
    tf_gpus = tf.config.list_physical_devices("GPU")
    print(f"tensorflow {tf.__version__} GPUs visible: {tf_gpus or 'NONE (CPU fallback)'}")

    from app.services import detection as det_svc
    det_svc.warmup_models(["balanced"])
    model = det_svc._get_model("balanced")
    print(f"YOLO model device: {model.device}")

    from app.services import ocr as ocr_svc
    ocr_svc._get_reader("en")
    print(f"EasyOCR gpu flag: {ocr_svc._use_gpu}")

    from app.services import scene as scene_svc
    dev = scene_svc._get_device()
    pipe = scene_svc._get_pipeline("git", dev)
    model_device = next(pipe.model.parameters()).device
    print(f"Scene (GIT) pipeline device: {model_device}")

    from app.services.emotion import _DEEPFACE_OK
    print(f"DeepFace importable: {_DEEPFACE_OK}")
    print(
        "NOTE: DeepFace/TF has no GPU visible above -> emotion recognition "
        "runs on CPU regardless of the worker's GPU passthrough."
    )
    print()


def _run_pipeline_timing(image_path: Path) -> None:
    print("=" * 70)
    print(f"PIPELINE TIMING — {image_path.name}")
    print("=" * 70)

    image = Image.open(image_path).convert("RGB")
    print(f"Image size: {image.size}\n")

    from app.services import detection as det_svc
    from app.services import emotion as emo_svc
    from app.services import ocr as ocr_svc
    from app.services import scene as scene_svc
    from app.services import story as story_svc
    from app.services import tts as tts_svc
    from app.services import quiz as quiz_svc

    print("-- cold model load (first call pays load cost) --")
    _timed("detection warmup", det_svc.warmup_models, ["balanced"])
    _timed("emotion warmup (DeepFace)", emo_svc.warmup_emotion)
    _timed("ocr warmup (EasyOCR)", ocr_svc.warmup_ocr)
    _timed("scene warmup (GIT)", scene_svc.warmup_scene, ["git"])
    print()

    print("-- steady-state inference (warm models, matches real traffic) --")
    detections, _ = _timed("1. detection", det_svc.run_detection, image, "balanced")
    print(f"     -> {len(detections)} objects: {[d['label'] for d in detections]}")

    emotions, _ = _timed(
        "2. emotion", emo_svc.run_emotion_recognition, image, "standard", detections, True
    )
    print(f"     -> {len(emotions)} faces")

    ocr_result, _ = _timed("3. ocr", ocr_svc.run_ocr, image, "en")

    scene_result, _ = _timed(
        "4. scene caption (raw, local model only)", scene_svc.generate_scene_description, image, "git"
    )
    print(f"     -> {scene_result['description'][:80]}")

    enriched, _ = _timed(
        "4b. scene enrichment (Gemini, network)",
        story_svc.enrich_scene_description,
        scene_result["description"], detections, emotions, ocr_result,
    )
    scene_result = {**scene_result, "description": enriched}

    stories, _ = _timed(
        "5. story x3 (parallel Gemini calls)",
        story_svc.generate_stories, detections, emotions, scene_result,
        ["fun_adventure", "social_story", "educational"], ocr_result,
    )

    _, _ = _timed("6. tts (gTTS, network)", tts_svc.synthesise_audio, stories, "en")

    story_texts = [s["content"] for s in stories]
    _, _ = _timed(
        "7. quiz (Gemini)",
        quiz_svc.generate_quiz_questions, story_texts, "beginner", 3,
        [d["label"] for d in detections],
    )
    print()


def main() -> None:
    image_path = Path(sys.argv[1]) if len(sys.argv) > 1 else _FALLBACK_IMAGE
    if not image_path.exists():
        print(f"Image not found: {image_path}", file=sys.stderr)
        sys.exit(1)

    _report_devices()
    _run_pipeline_timing(image_path)


if __name__ == "__main__":
    main()
