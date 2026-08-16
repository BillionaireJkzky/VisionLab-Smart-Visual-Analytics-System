from __future__ import annotations

import hashlib
import logging
import uuid

from PIL import Image, ImageDraw, ImageFont

from app.core.config import settings

logger = logging.getLogger(__name__)


PALETTE = [
    (34, 211, 238),   # cyan
    (59, 130, 246),   # blue
    (99, 102, 241),   # indigo
    (168, 85, 247),   # violet
    (236, 72, 153),   # pink
    (244, 63, 94),    # rose
    (249, 115, 22),   # orange
    (234, 179, 8),    # amber
    (16, 185, 129),   # emerald
    (14, 165, 233),   # sky
]


def _stable_color(label: str) -> tuple[int, int, int]:
    key = (label or "object").strip().lower().encode("utf-8")
    idx = int(hashlib.md5(key).hexdigest(), 16) % len(PALETTE)
    return PALETTE[idx]


def _load_font(size: int):
    for font_name in ("arial.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(font_name, size)
        except OSError as exc:
            logger.debug("Font '%s' unavailable for annotations: %s", font_name, str(exc))
    return ImageFont.load_default()


def _clamp(value: int, low: int, high: int) -> int:
    return max(low, min(value, high))


def _intersects(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    return not (ax2 < bx1 or bx2 < ax1 or ay2 < by1 or by2 < ay1)


def _pretty_label(label: str) -> str:
    label = (label or "object").replace("_", " ").strip()
    return label.title()


def save_plain_image(image: Image.Image) -> str:
    """
    Save the image as-is (no boxes/labels), for when there's nothing to draw
    on it — the caller couldn't draw detections (e.g. an unexpected error),
    but the analysis result should still ALWAYS have a viewable image rather
    than none at all.
    """
    filename = f"{uuid.uuid4().hex}.jpg"
    output_path = settings.image_dir / filename
    image.convert("RGB").save(output_path, format="JPEG", quality=92)
    return f"/images/{filename}"


def draw_detections(
    image: Image.Image,
    detections: list[dict],
    min_conf: float = 0.0,
) -> str:
    if image.mode != "RGBA":
        base = image.convert("RGBA")
    else:
        base = image.copy()

    width, height = base.size
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    short_side = min(width, height)
    stroke = max(2, short_side // 320)
    glow = stroke + 2
    radius = max(10, short_side // 55)
    font_size = max(14, short_side // 42)
    font = _load_font(font_size)

    measure = ImageDraw.Draw(Image.new("RGBA", (10, 10), (0, 0, 0, 0)))

    def area(det: dict) -> int:
        x1, y1, x2, y2 = det.get("bounding_box", [0, 0, 0, 0])
        return max(0, int(x2 - x1)) * max(0, int(y2 - y1))

    detections_sorted = sorted(detections or [], key=area, reverse=True)
    used_label_boxes: list[tuple[int, int, int, int]] = []

    for det in detections_sorted:
        conf = float(det.get("confidence", 0) or 0)
        if conf < min_conf:
            continue

        try:
            x1, y1, x2, y2 = det["bounding_box"]
        except (KeyError, TypeError, ValueError) as exc:
            logger.debug("Skipping invalid detection bounding_box payload: %s", str(exc))
            continue

        x1 = _clamp(int(x1), 0, width - 1)
        y1 = _clamp(int(y1), 0, height - 1)
        x2 = _clamp(int(x2), 0, width - 1)
        y2 = _clamp(int(y2), 0, height - 1)

        if x2 <= x1 or y2 <= y1:
            continue

        label = _pretty_label(det.get("label", "object"))
        color = _stable_color(label)
        r, g, b = color

        draw.rounded_rectangle(
            [x1 - 1, y1 - 1, x2 + 1, y2 + 1],
            radius=radius,
            outline=(r, g, b, 90),
            width=glow,
        )

        draw.rounded_rectangle(
            [x1, y1, x2, y2],
            radius=radius,
            fill=(r, g, b, 28),
            outline=(r, g, b, 255),
            width=stroke,
        )

        corner_len = max(12, short_side // 28)
        accent_w = max(2, stroke + 1)

        draw.line([(x1, y1), (x1 + corner_len, y1)], fill=(255, 255, 255, 220), width=accent_w)
        draw.line([(x1, y1), (x1, y1 + corner_len)], fill=(255, 255, 255, 220), width=accent_w)
        draw.line([(x2 - corner_len, y2), (x2, y2)], fill=(255, 255, 255, 220), width=accent_w)
        draw.line([(x2, y2 - corner_len), (x2, y2)], fill=(255, 255, 255, 220), width=accent_w)

        text = f"{label} {int(round(conf * 100))}%"
        tb = measure.textbbox((0, 0), text, font=font)
        text_w = tb[2] - tb[0]
        text_h = tb[3] - tb[1]

        pad_x = max(8, font_size // 2)
        pad_y = max(5, font_size // 3)
        chip_w = text_w + pad_x * 2 + max(8, font_size // 2) + 8
        chip_h = text_h + pad_y * 2

        candidates = [
            (x1, y1 - chip_h - 8, x1 + chip_w, y1 - 8),
            (x1, y1 + 8, x1 + chip_w, y1 + 8 + chip_h),
            (x2 - chip_w, y1 - chip_h - 8, x2, y1 - 8),
            (x2 - chip_w, y1 + 8, x2, y1 + 8 + chip_h),
        ]

        fixed_candidates = []
        for bx1, by1, bx2, by2 in candidates:
            bw = bx2 - bx1
            bh = by2 - by1
            bx1 = _clamp(bx1, 0, width - bw)
            by1 = _clamp(by1, 0, height - bh)
            bx2 = bx1 + bw
            by2 = by1 + bh
            fixed_candidates.append((bx1, by1, bx2, by2))

        label_box = fixed_candidates[0]
        for candidate in fixed_candidates:
            if not any(_intersects(candidate, used) for used in used_label_boxes):
                label_box = candidate
                break

        used_label_boxes.append(label_box)
        lx1, ly1, lx2, ly2 = label_box

        draw.rounded_rectangle(
            [lx1 + 1, ly1 + 2, lx2 + 1, ly2 + 2],
            radius=max(10, radius // 2),
            fill=(0, 0, 0, 70),
        )

        draw.rounded_rectangle(
            [lx1, ly1, lx2, ly2],
            radius=max(10, radius // 2),
            fill=(12, 18, 28, 215),
            outline=(r, g, b, 235),
            width=max(1, stroke - 1),
        )

        dot_size = max(8, font_size // 2)
        dot_x = lx1 + pad_x
        dot_y = ly1 + (chip_h - dot_size) // 2

        draw.ellipse(
            [dot_x, dot_y, dot_x + dot_size, dot_y + dot_size],
            fill=(r, g, b, 255),
        )

        text_x = dot_x + dot_size + 8
        text_y = ly1 + pad_y - 1

        draw.text(
            (text_x, text_y),
            text,
            font=font,
            fill=(245, 248, 255, 255),
        )

    composed = Image.alpha_composite(base, overlay).convert("RGB")

    filename = f"{uuid.uuid4().hex}.jpg"
    output_path = settings.image_dir / filename
    composed.save(output_path, format="JPEG", quality=92)

    return f"/images/{filename}"