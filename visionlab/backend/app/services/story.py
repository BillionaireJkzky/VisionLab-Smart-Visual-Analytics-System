from __future__ import annotations

import logging
import time
from typing import List, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

_client = None

_SYSTEM_PROMPT = (
    "You are a gifted children's author who writes vivid, imaginative content for ages 5–12. "
    "Your writing is warm, specific to the image details provided, and brings every scene to life. "
    "Weave in concrete details — the objects visible, where they are, the emotions of people, "
    "and any text readable in the image. Be positive and inclusive. "
    "No violence, fear, or stereotypes. Use clear, beautiful language that flows naturally."
)

_STORY_INSTRUCTIONS = {
    "fun_adventure": (
        "Write one engaging fun adventure story of exactly 120–150 words. "
        "Give the main character(s) a name and a small goal. "
        "Build a clear beginning, exciting middle, and a joyful ending. "
        "Weave in the specific objects, their locations, and the scene details. "
        "Make it feel alive and specific — not generic."
    ),
    "social_story": (
        "Write one Carol Gray style social story of 100–130 words using first-person perspective "
        "('I can...', 'I see...', 'I know...'). "
        "Describe the situation clearly using what is visible in the image. "
        "Explain what others around may be thinking or feeling. "
        "End with a calm, positive social action the reader can take. "
        "Use simple, literal, supportive language throughout."
    ),
    "educational": (
        "Write one educational story of 100–130 words that teaches naturally through the image. "
        "Incorporate the visible objects and where they are. "
        "After the story, list exactly 5 vocabulary words seen or implied by the image, "
        "each with a clear, child-friendly one-sentence definition."
    ),
}


def _get_client():
    global _client
    if _client is not None:
        return _client
    api_key = getattr(settings, "GEMINI_API_KEY", None)
    if not api_key:
        return None
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        _client = genai
        logger.info("Gemini client initialized.")
        return _client
    except Exception as exc:
        logger.exception("Gemini client init failed: %s", exc)
        return None


def _format_objects(detections: List[dict], max_items: int = 8) -> str:
    """Return a location-aware object description string."""
    if not detections:
        return "none visible"
    seen: dict[str, dict] = {}
    for d in detections:
        label = (d.get("label") or "unknown").strip().lower()
        if not label:
            continue
        conf = float(d.get("confidence", 0) or 0)
        loc = (d.get("location") or "").strip()
        if label not in seen or conf > seen[label]["conf"]:
            seen[label] = {"conf": conf, "location": loc}

    parts = []
    for label, info in list(seen.items())[:max_items]:
        loc = info["location"]
        parts.append(f"{label} ({loc})" if loc else label)
    return ", ".join(parts) if parts else "none visible"


def _format_emotions_rich(emotions: List[dict], max_items: int = 3) -> str:
    """Return the computed emotion description sentences (richer than just names)."""
    if not emotions:
        return ""
    parts = []
    for e in emotions[:max_items]:
        desc = (e.get("description") or "").strip()
        if desc:
            parts.append(desc)
        else:
            label = (e.get("child_friendly_label") or e.get("emotion") or "").strip()
            if label:
                parts.append(label)
    return " ".join(parts) if parts else ""


def _format_ocr(ocr: Optional[dict]) -> str:
    """Return the best available OCR text, truncated if very long."""
    if not ocr:
        return ""
    text = ((ocr.get("translated_text") or ocr.get("raw_text")) or "").strip()
    if not text:
        return ""
    if len(text) > 250:
        text = text[:250].rsplit(" ", 1)[0] + "…"
    return text


def _scene_text(scene: Optional[dict]) -> str:
    if not scene:
        return "unknown scene"
    return (scene.get("description") or scene.get("label") or "unknown scene").strip()


def _build_prompt(
    detections: List[dict],
    emotions: List[dict],
    scene: Optional[dict],
    ocr: Optional[dict],
    story_type: str,
) -> str:
    instruction = _STORY_INSTRUCTIONS.get(story_type, _STORY_INSTRUCTIONS["fun_adventure"])

    lines = [instruction, "", f"Scene: {_scene_text(scene)}"]
    lines.append(f"Objects in the image: {_format_objects(detections)}")

    emotions_desc = _format_emotions_rich(emotions)
    if emotions_desc:
        lines.append(f"People and emotions: {emotions_desc}")

    ocr_text = _format_ocr(ocr)
    if ocr_text:
        lines.append(f"Text visible in the image: {ocr_text}")

    return "\n".join(lines)


def _error_placeholder(error_text: str) -> str:
    et = (error_text or "").lower()
    if "429" in et or "quota" in et or "rate limit" in et:
        return "[Story generation unavailable: rate limit reached]"
    if "403" in et:
        return "[Story generation unavailable: model access not allowed]"
    if "404" in et:
        return "[Story generation unavailable: model not found]"
    if "401" in et or "api key" in et:
        return "[Story generation unavailable: invalid API key]"
    return "[Story generation unavailable: temporary Gemini error]"


def _generate_one_story(client, model_name: str, full_prompt: str) -> str:
    model = client.GenerativeModel(model_name)
    response = model.generate_content(full_prompt)
    content = getattr(response, "text", None)
    if content and content.strip():
        return content.strip()
    for candidate in getattr(response, "candidates", None) or []:
        parts = getattr(getattr(candidate, "content", None), "parts", None) or []
        collected = [getattr(p, "text", None) for p in parts if getattr(p, "text", None)]
        if collected:
            return "\n".join(collected).strip()
    raise ValueError("empty response")


def enrich_scene_description(
    raw_caption: str,
    detections: List[dict],
    emotions: List[dict],
    ocr: Optional[dict] = None,
) -> str:
    """
    Use Gemini to generate a TikTok-style "Quick Highlights" structured scene analysis:
      - 2-sentence summary with bold key terms (**word**)
      - 2 thematic sections with emoji header + 3 bullet points each (**Label**: explanation)
    Falls back silently to the raw caption if Gemini is unavailable or fails.
    """
    if not raw_caption or raw_caption.lower().startswith("unable to generate"):
        return raw_caption

    client = _get_client()
    if client is None:
        return raw_caption

    objects_part = _format_objects(detections, max_items=8)
    ocr_part = _format_ocr(ocr)
    emotions_desc = _format_emotions_rich(emotions)

    context_lines = [
        f"Image caption: {raw_caption}",
        f"Objects visible: {objects_part}",
    ]
    if emotions_desc:
        context_lines.append(f"People/emotions: {emotions_desc}")
    if ocr_part:
        context_lines.append(f"Visible text in image: {ocr_part}")

    prompt = (
        "You are producing a 'Quick Highlights' educational report about an image, "
        "exactly like TikTok's visual search feature.\n\n"
        "Using the image details below, write output in this EXACT format — no extra text, no preamble:\n\n"
        "---\n"
        "[2 sentences describing the image. Bold 1-2 key subject terms using **asterisks**, "
        "e.g. **Songkran** or **dopamine**.]\n\n"
        "[relevant emoji] **[Section 1 Title]**\n"
        "• **[Label]**: [one-sentence explanation]\n"
        "• **[Label]**: [one-sentence explanation]\n"
        "• **[Label]**: [one-sentence explanation]\n\n"
        "[relevant emoji] **[Section 2 Title]**\n"
        "• **[Label]**: [one-sentence explanation]\n"
        "• **[Label]**: [one-sentence explanation]\n"
        "• **[Label]**: [one-sentence explanation]\n"
        "---\n\n"
        "Rules:\n"
        "- Choose section themes based on actual image content "
        "(cultural, scientific, historical, nutritional, artistic, geographical, psychological, etc.)\n"
        "- Each section must have exactly 3 bullet points in **Bold Label**: explanation format\n"
        "- Total: 120–180 words\n"
        "- Do NOT include a footer or closing remark — the app adds that automatically\n\n"
        + "\n".join(context_lines)
    )

    model_name = getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash")
    try:
        result = _generate_one_story(client, model_name, prompt)
        # Validate: must contain section structure markers
        if result and "**" in result and "•" in result and len(result.split()) >= 30:
            logger.info("Scene Quick Highlights generated by Gemini (%d words).", len(result.split()))
            return result.strip()
        logger.warning("Scene highlights output did not match expected format, using caption fallback.")
    except Exception as exc:
        logger.warning("Gemini scene highlights generation failed: %s", exc)

    return raw_caption


def generate_stories(
    detections: List[dict],
    emotions: List[dict],
    scene: Optional[dict],
    story_types: Optional[List[str]] = None,
    ocr: Optional[dict] = None,
) -> List[dict]:
    if story_types is None:
        story_types = ["fun_adventure", "social_story", "educational"]

    model_name = getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash")
    fallback_model_name = getattr(settings, "GEMINI_FALLBACK_MODEL", "gemini-2.0-flash")
    client = _get_client()

    if client is None:
        logger.warning("Gemini unavailable — returning error placeholders.")
        return [
            {"story_type": st, "content": "[Story generation unavailable]"}
            for st in story_types
        ]

    stories: List[dict] = []
    for story_type in story_types:
        prompt = _build_prompt(detections, emotions, scene, ocr, story_type)
        full_prompt = f"{_SYSTEM_PROMPT}\n\n{prompt}"

        content: Optional[str] = None
        last_error: Optional[Exception] = None

        for attempt_index, current_model in enumerate(
            [model_name, fallback_model_name], start=1
        ):
            if not current_model:
                continue
            try:
                t0 = time.time()
                content = _generate_one_story(client, current_model, full_prompt)
                logger.info(
                    "Story ok type=%s model=%s in %.2fs",
                    story_type, current_model, time.time() - t0,
                )
                break
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "Story failed type=%s model=%s attempt=%d: %s",
                    story_type, current_model, attempt_index, str(exc),
                )
                if attempt_index == 1:
                    time.sleep(0.5)

        if not content:
            error_text = str(last_error) if last_error else "unknown"
            content = _error_placeholder(error_text)

        stories.append({"story_type": story_type, "content": content.strip()})

    return stories
