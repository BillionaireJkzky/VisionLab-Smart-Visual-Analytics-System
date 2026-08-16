"""
VisionLab eval — shared helpers.

Not part of the web app and not imported by it. Used only by the eval/*.py
scripts in this folder to keep path setup and result-saving in one place.
"""
from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Any

logger = logging.getLogger("eval")
logging.basicConfig(level=logging.INFO, format="%(levelname)-8s | %(message)s")

EVAL_DIR = Path(__file__).resolve().parent
BACKEND_DIR = EVAL_DIR.parent
DATA_DIR = EVAL_DIR / "data"
RESULTS_DIR = EVAL_DIR / "results"


def ensure_app_importable() -> None:
    """
    Make `import app.services...` work regardless of the caller's cwd.

    Scripts are meant to be run as `python -m eval.detection` from /app
    (the worker's WORKDIR), which already puts backend/ on sys.path — this
    is a safety net for any other invocation style.
    """
    backend_str = str(BACKEND_DIR)
    if backend_str not in sys.path:
        sys.path.insert(0, backend_str)


def ensure_results_dir() -> Path:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    return RESULTS_DIR


def save_json(name: str, payload: dict[str, Any]) -> Path:
    """Dump *payload* to eval/results/<name>.json and return the path."""
    results_dir = ensure_results_dir()
    path = results_dir / f"{name}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, default=str)
    logger.info("Saved %s", path)
    return path
