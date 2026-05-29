"""
VisionLab – Text-to-Speech Service (gTTS).

Synthesises audio from the generated story text and saves an MP3 file
to the configured audio output directory.
Returns a relative URL path to the generated file.
"""
from __future__ import annotations

import logging
import re
import uuid
from pathlib import Path
from typing import List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

_MAX_TTS_CHARS = 450


def _clean_text(text: str) -> str:
    """Clean markdown-ish text for better speech."""
    if not text:
        return ""

    text = text.replace("**", "")
    text = text.replace("*", "")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _remove_vocab_section(text: str) -> str:
    """
    Remove educational vocab list sections from narration to keep audio short.
    """
    if not text:
        return ""

    patterns = [
        r"Vocabulary words?:.*",
        r"Vocabulary:.*",
        r"Words?:.*definitions?.*",
    ]

    cleaned = text
    for pattern in patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE | re.DOTALL)

    return cleaned.strip()


def _truncate_for_tts(text: str, max_chars: int = _MAX_TTS_CHARS) -> str:
    if len(text) <= max_chars:
        return text

    truncated = text[:max_chars].rsplit(" ", 1)[0].strip()
    if truncated:
        return truncated + "..."
    return text[:max_chars].strip() + "..."


def _is_story_usable(text: str) -> bool:
    if not text:
        return False

    blocked_prefixes = [
        "[Story generation failed",
        "[Story generation unavailable",
    ]

    return not any(text.startswith(prefix) for prefix in blocked_prefixes)


def _select_story_text(stories: List[dict]) -> str:
    """
    Choose the best story to read aloud.

    Priority:
    1. first valid non-empty story
    2. fallback text if nothing usable exists
    """
    if not stories:
        return "I analysed this image for you."

    for story in stories:
        content = _clean_text(story.get("content", ""))
        if not _is_story_usable(content):
            continue

        content = _remove_vocab_section(content)
        content = _truncate_for_tts(content)

        if content:
            return content

    return "I analysed this image for you."


def synthesise_audio(
    stories: List[dict],
    lang: str = "en",
) -> Optional[str]:
    """
    Generate TTS audio from story text and return the relative URL path.

    Returns None on failure.
    """
    try:
        from gtts import gTTS
    except ImportError:
        logger.warning("gTTS not installed – skipping TTS.")
        return None

    narration = _select_story_text(stories)
    if not narration:
        return None

    filename = f"{uuid.uuid4().hex}.mp3"
    output_path: Path = settings.audio_dir / filename

    try:
        tts = gTTS(text=narration, lang=lang, slow=False)
        tts.save(str(output_path))
        logger.debug("TTS audio saved to %s", output_path)
        return f"/audio/{filename}"
    except Exception as exc:
        logger.error("TTS synthesis failed: %s", exc)
        return None