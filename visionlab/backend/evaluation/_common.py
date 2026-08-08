"""
VisionLab evaluation harness — shared helpers.

Not part of the web app. Used only by the evaluate_*.py scripts in this
folder to keep path setup and dataset-walking logic in one place.
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Iterator, Optional, Tuple

from PIL import Image, UnidentifiedImageError

logger = logging.getLogger("evaluation")
logging.basicConfig(level=logging.INFO, format="%(levelname)-8s | %(message)s")

EVAL_DIR = Path(__file__).resolve().parent
BACKEND_DIR = EVAL_DIR.parent
DATASETS_DIR = EVAL_DIR / "datasets"
RESULTS_DIR = EVAL_DIR / "results"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def ensure_app_importable() -> None:
    """
    Make `import app.services...` work regardless of the caller's cwd.

    Scripts are meant to be run as `python -m evaluation.evaluate_emotion`
    from inside backend/, which already puts backend/ on sys.path — this
    is a safety net for running a script file directly instead.
    """
    backend_str = str(BACKEND_DIR)
    if backend_str not in sys.path:
        sys.path.insert(0, backend_str)


def ensure_results_dir() -> Path:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    return RESULTS_DIR


def load_image_safely(path: Path) -> Optional[Image.Image]:
    """Load an image, returning None (and logging) instead of raising on
    a corrupt or unreadable file — evaluation runs must never crash on
    one bad file in a large dataset."""
    try:
        img = Image.open(path)
        img.load()
        return img.convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        logger.warning("Skipping unreadable image %s: %s", path, exc)
        return None


def iter_labeled_images(root: Path) -> Iterator[Tuple[str, Path]]:
    """
    Walk `root/<label>/<image files>` and yield (label, image_path) pairs.

    Each immediate subfolder of `root` is treated as a ground-truth class
    label (e.g. datasets/emotion/happy/img1.jpg -> label "happy").
    Non-image files and files directly in `root` (not in a label subfolder)
    are ignored.
    """
    if not root.exists():
        return
    for label_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        label = label_dir.name
        for file_path in sorted(label_dir.iterdir()):
            if file_path.suffix.lower() in IMAGE_EXTENSIONS:
                yield label, file_path


def dataset_is_empty(root: Path) -> bool:
    return next(iter_labeled_images(root), None) is None


def require_dataset(root: Path, module_name: str, expected_layout: str) -> bool:
    """Print a clear, actionable message and return False if the dataset
    folder has nothing usable in it yet, instead of crashing deep inside
    a loop over zero items."""
    if dataset_is_empty(root):
        print(
            f"\n[{module_name}] No images found under {root}\n"
            f"Expected layout: {expected_layout}\n"
            f"See evaluation/README.md for where to download a suitable dataset.\n"
        )
        return False
    return True
