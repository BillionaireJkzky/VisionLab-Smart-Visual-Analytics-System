from __future__ import annotations

import hashlib
import logging
import re
from typing import Dict, Tuple

from PIL import Image

logger = logging.getLogger(__name__)

MODEL_NAMES = {
    "blip": "Salesforce/blip-image-captioning-large",
    "git": "microsoft/git-large-coco",
    "vitgpt2": "nlpconnect/vit-gpt2-image-captioning",
}

# Must be passed using generate_kwargs=...
GENERATION_KWARGS = {
    "blip": {
        "max_new_tokens": 40,
        "num_beams": 4,
        "repetition_penalty": 1.10,
    },
    "git": {
        "max_new_tokens": 48,
        "num_beams": 4,
        "repetition_penalty": 1.12,
    },
    "vitgpt2": {
        "max_new_tokens": 52,
        "num_beams": 5,
        "repetition_penalty": 1.18,
    },
}

PHOTO_INTROS = [
    "This image shows",
    "The scene shows",
    "The picture captures",
    "This photo shows",
]

ILLUSTRATION_INTROS = [
    "This image shows",
    "This illustration shows",
    "The artwork shows",
    "The scene depicts",
]

GENERIC_TAILS = [
    "it appears to be a real-world scene with clear visual details",
    "this scene contains meaningful visual details and appears clear and natural",
]

_pipelines: Dict[Tuple[str, int], object] = {}
_device: int | None = None


def _get_device() -> int:
    global _device
    if _device is not None:
        return _device

    try:
        import torch
        _device = 0 if torch.cuda.is_available() else -1
    except Exception as exc:
        logger.warning("Torch CUDA check failed, falling back to CPU: %s", exc)
        _device = -1

    logger.info("Scene service preferred device: %s", "GPU" if _device == 0 else "CPU")
    return _device


def _normalize_model_key(model_key: str) -> str:
    model_key = (model_key or "").strip().lower()
    if model_key not in MODEL_NAMES:
        logger.warning("Unknown scene model '%s'. Falling back to 'git'.", model_key)
        return "git"
    return model_key


def _candidate_models(requested_model: str) -> list[str]:
    requested_model = _normalize_model_key(requested_model)

    ordered = [requested_model, "git", "blip", "vitgpt2"]
    seen = set()
    result = []

    for model in ordered:
        if model in MODEL_NAMES and model not in seen:
            seen.add(model)
            result.append(model)

    return result


def _get_pipeline(model_key: str, device: int):
    model_key = _normalize_model_key(model_key)
    cache_key = (model_key, device)

    if cache_key in _pipelines:
        return _pipelines[cache_key]

    try:
        from transformers import pipeline as hf_pipeline

        model_name = MODEL_NAMES[model_key]

        logger.info(
            "Loading scene model '%s' (%s) on %s...",
            model_key,
            model_name,
            "GPU" if device == 0 else "CPU",
        )

        pipe = hf_pipeline(
            "image-to-text",
            model=model_name,
            device=device,
        )

        _pipelines[cache_key] = pipe

        logger.info(
            "Scene pipeline ready: %s on %s",
            model_name,
            "GPU" if device == 0 else "CPU",
        )
        return pipe

    except Exception as exc:
        logger.error(
            "Failed to load scene model '%s' on %s: %s",
            model_key,
            "GPU" if device == 0 else "CPU",
            exc,
            exc_info=True,
        )
        raise


def _normalize_spaces(text: str) -> str:
    return " ".join((text or "").split())


def _dedupe_consecutive_words(text: str) -> str:
    words = text.split()
    if not words:
        return text

    cleaned = [words[0]]
    for word in words[1:]:
        if word.lower() != cleaned[-1].lower():
            cleaned.append(word)

    return " ".join(cleaned)


def _remove_generic_tails(text: str) -> str:
    lowered = text.lower()
    for tail in GENERIC_TAILS:
        if tail in lowered:
            idx = lowered.find(tail)
            text = text[:idx].rstrip(" .,!;:")
            lowered = text.lower()
    return text


def _strip_prefixes(text: str) -> str:
    patterns = [
        r"^(a|an|the)\s+(photo|picture|image|scene)\s+of\s+",
        r"^(this is|this image shows|the image shows|the scene shows|this scene shows)(\s+|$)",
        r"^(there is|there are)\s+",
    ]

    result = text.strip()
    for pattern in patterns:
        result = re.sub(pattern, "", result, flags=re.IGNORECASE).strip()

    return result


def _sentence_case(text: str) -> str:
    if not text:
        return text
    return text[0].upper() + text[1:]


def _lowercase_first(text: str) -> str:
    if not text:
        return text
    return text[0].lower() + text[1:]


def _ensure_period(text: str) -> str:
    text = text.strip()
    if not text:
        return text
    if text.endswith((".", "!", "?")):
        return text
    return text + "."


def _looks_like_illustration(text: str) -> bool:
    lowered = text.lower()
    illustration_keywords = [
        "cartoon",
        "animated",
        "animation",
        "anime",
        "illustration",
        "drawing",
        "painting",
        "artwork",
        "sketch",
        "render",
    ]
    return any(keyword in lowered for keyword in illustration_keywords)


def _stable_pick(options: list[str], seed_text: str) -> str:
    if not options:
        return "This image shows"

    digest = hashlib.md5(seed_text.encode("utf-8")).hexdigest()
    index = int(digest, 16) % len(options)
    return options[index]


def _clean_caption(raw: str) -> str:
    raw = _normalize_spaces(raw)
    # Strip tokenizer artifacts emitted by GIT/BLIP:
    #   "[ unused0 ]"  — with closing bracket
    #   "[ unused0."   — no closing bracket, period follows
    #   "[ unused0"    — at end of string
    raw = re.sub(r'\[\s*unused\d*[\s.,!?\]]*', '', raw, flags=re.IGNORECASE)
    # Also strip bare [SEP], [CLS], [PAD] tokens
    raw = re.sub(r'\[\s*(?:SEP|CLS|PAD|MASK|UNK)\s*\]', '', raw, flags=re.IGNORECASE)
    raw = _remove_generic_tails(raw)
    raw = _strip_prefixes(raw)
    raw = _dedupe_consecutive_words(raw)
    raw = raw.strip(' .,!;:')

    raw = re.sub(r"\s+([,.!?;:])", r"\1", raw)
    raw = re.sub(r'[""]', '"', raw)

    return raw.strip()


def _expand_caption(raw: str, model_key: str) -> str:
    raw = _clean_caption(raw)

    if not raw:
        return ""

    if len(raw.split()) >= 12 and any(
        token in raw for token in [",", " with ", " near ", " in ", " on "]
    ):
        return _ensure_period(_sentence_case(raw))

    intro_pool = ILLUSTRATION_INTROS if _looks_like_illustration(raw) else PHOTO_INTROS
    intro = _stable_pick(intro_pool, f"{model_key}:{raw}")

    body = _lowercase_first(raw)
    sentence = f"{intro} {body}"

    return _ensure_period(_sentence_case(sentence))


def _run_generation(image: Image.Image, model_key: str, device: int) -> str:
    pipe = _get_pipeline(model_key, device=device)

    results = pipe(
        image.convert("RGB"),
        generate_kwargs=GENERATION_KWARGS.get(model_key, {}),
    )

    raw = ""
    if isinstance(results, list) and results:
        raw = results[0].get("generated_text", "").strip()

    description = _expand_caption(raw, model_key)
    if not description:
        raise ValueError(f"Scene model '{model_key}' returned empty caption")

    return description


def generate_scene_description(image: Image.Image, scene_model: str = "git") -> dict:
    requested_model = _normalize_model_key(scene_model)
    preferred_device = _get_device()

    devices_to_try = [preferred_device]
    if preferred_device == 0:
        devices_to_try.append(-1)

    last_error: Exception | None = None

    for device in devices_to_try:
        for model_key in _candidate_models(requested_model):
            try:
                description = _run_generation(image, model_key, device=device)

                logger.info(
                    "Scene description generated with model '%s' on %s: %s",
                    model_key,
                    "GPU" if device == 0 else "CPU",
                    description,
                )

                return {
                    "description": description,
                    "model": model_key,
                    "requested_model": requested_model,
                }

            except Exception as exc:
                last_error = exc
                logger.warning(
                    "Scene description failed with model '%s' on %s: %s",
                    model_key,
                    "GPU" if device == 0 else "CPU",
                    exc,
                    exc_info=True,
                )

    logger.error("All scene description attempts failed. Last error: %s", last_error)

    return {
        "description": "Unable to generate scene description.",
        "model": requested_model,
        "requested_model": requested_model,
    }


