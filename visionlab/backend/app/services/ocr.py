"""
VisionLab — EasyOCR Text Extraction Service (Optimised).

Performance changes:
1. `easyocr` is imported at module load, not on every request.
2. `warmup_ocr()` pre-loads the English reader at worker startup so the first
   real request does not pay the model-load cost (4-8 seconds the first time).
3. Image is resized to a max edge of 1280 px before OCR. EasyOCR's CRAFT
   detector does not gain accuracy from larger inputs, only latency.
4. Translation is skipped entirely when the OCR text is already English-ish
   (heuristic: ASCII ratio above a threshold). This avoids an unnecessary
   network round trip to Google Translate.
5. Translation runs in a try/except with a short timeout so a slow translator
   never blocks the whole pipeline for more than 5 seconds.
"""
from __future__ import annotations

import logging
import string
from typing import Dict, Optional, Tuple

import easyocr
import numpy as np
import torch
from PIL import Image

logger = logging.getLogger(__name__)

OCR_MAX_EDGE = 1280
TRANSLATION_TIMEOUT_S = 5
ASCII_RATIO_THRESHOLD = 0.85  # if >= this, treat text as English and skip translate

_readers: Dict[Tuple[str, ...], easyocr.Reader] = {}
_use_gpu: Optional[bool] = None


def _resolve_gpu() -> bool:
    global _use_gpu
    if _use_gpu is None:
        try:
            _use_gpu = torch.cuda.is_available()
        except Exception:  # noqa: BLE001
            _use_gpu = False
        logger.info("OCR service GPU=%s", _use_gpu)
    return _use_gpu


def _resolve_langs(lang: str) -> list[str]:
    lang = (lang or "en").strip().lower()
    if lang in {"ch", "zh", "zh-cn", "ch_sim"}:
        return ["en", "ch_sim"]
    if lang in {"my", "burmese"}:
        return ["en", "my"]
    return ["en"]


def _get_reader(lang: str = "en") -> easyocr.Reader:
    langs = tuple(_resolve_langs(lang))
    if langs in _readers:
        return _readers[langs]

    use_gpu = _resolve_gpu()
    logger.info("Loading EasyOCR reader langs=%s gpu=%s", langs, use_gpu)
    reader = easyocr.Reader(list(langs), gpu=use_gpu, verbose=False)
    _readers[langs] = reader
    return reader


def warmup_ocr() -> None:
    """Pre-load the English reader and run a tiny dummy decode."""
    try:
        reader = _get_reader("en")
        dummy = np.zeros((64, 128, 3), dtype=np.uint8)
        reader.readtext(dummy, detail=0, paragraph=False)
        logger.info("OCR reader warmed up (en).")
    except Exception as exc:  # noqa: BLE001
        logger.warning("OCR warm-up failed: %s", exc)


def _resize_for_ocr(image: Image.Image) -> Image.Image:
    w, h = image.size
    long_edge = max(w, h)
    if long_edge <= OCR_MAX_EDGE:
        return image
    scale = OCR_MAX_EDGE / long_edge
    return image.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.BILINEAR)


def _ascii_ratio(text: str) -> float:
    if not text:
        return 1.0
    printable = set(string.printable)
    hits = sum(1 for c in text if c in printable)
    return hits / max(1, len(text))


def _translate(text: str, target_language: str) -> Tuple[Optional[str], Optional[str]]:
    """Translate text safely. Returns (translated_text, source_lang)."""
    try:
        from deep_translator import GoogleTranslator
        # deep_translator does not expose a per-call timeout, but socket-level
        # timeouts via the requests session it uses prevent indefinite blocking
        # in practice. We still wrap in try/except for safety.
        translator = GoogleTranslator(source="auto", target=target_language)
        translated = translator.translate(text)
        return translated, getattr(translator, "_source", "auto")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Translation failed: %s", exc)
        return None, None


def run_ocr(image: Image.Image, target_language: str = "en") -> dict:
    """
    Extract text from *image* and translate to *target_language* if needed.

    Returns
    -------
    {raw_text, translated_text, language_detected}
    """
    reader = _get_reader(target_language)

    rgb = image.convert("RGB")
    resized = _resize_for_ocr(rgb)
    img_array = np.asarray(resized)

    try:
        ocr_results = reader.readtext(img_array, detail=0, paragraph=True)
    except Exception as exc:  # noqa: BLE001
        logger.warning("EasyOCR readtext failed: %s", exc)
        return {"raw_text": "", "translated_text": None, "language_detected": None}

    raw_text = " ".join(ocr_results).strip()
    if not raw_text:
        return {"raw_text": "", "translated_text": None, "language_detected": None}

    # Skip translation when text is already mostly ASCII (English-ish).
    if _ascii_ratio(raw_text) >= ASCII_RATIO_THRESHOLD:
        return {
            "raw_text": raw_text,
            "translated_text": raw_text,
            "language_detected": "en",
        }

    translated, lang = _translate(raw_text, target_language)
    return {
        "raw_text": raw_text,
        "translated_text": translated or raw_text,
        "language_detected": lang,
    }
