"""
VisionLab eval — scaffold eval/data/ocr/ground_truth.csv from images/.

Scans eval/data/ocr/images/ and writes/updates ground_truth.csv with one row
per image found: `image` = filename, `lang` = blank EasyOCR language code
(en, it, ko, ch_sim, th, ...), `text` = blank for you to fill in by hand.
Existing rows are never overwritten — if a row for an image is already in
the CSV (filled or not), its `lang`/`text` values are left exactly as-is;
only missing rows are added. A CSV written by an older version of this
script (columns `image,text`, no `lang`) is read and migrated automatically
— existing `text` is preserved, `lang` starts blank for you to fill in.

Run inside the GPU worker container (from repo root):
    docker compose exec worker python -m eval.ocr_scaffold

Workflow:
    1. Drop image files into eval/data/ocr/images/ (on the host — the folder
       is bind-mounted, see docker-compose.yml).
    2. Run this scaffold to generate/update ground_truth.csv.
    3. Open ground_truth.csv on the host and fill in `lang` (an EasyOCR
       language code — run `python -m eval.ocr --report-languages` to check
       what your installed EasyOCR supports) and `text` for each image.
    4. Run `python -m eval.ocr` to validate + score.
"""
from __future__ import annotations

import csv
from typing import Dict, List, Tuple

from eval._common import ensure_app_importable, logger

ensure_app_importable()

from eval.ocr import GROUND_TRUTH_CSV, IMAGES_DIR  # noqa: E402 — reuse the single source of truth for paths

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}


def _list_images() -> List[str]:
    if not IMAGES_DIR.exists():
        return []
    names = [p.name for p in IMAGES_DIR.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS]
    return sorted(names)


def _load_existing_rows() -> Dict[str, Tuple[str, str]]:
    """image -> (lang, text), as already present in ground_truth.csv (untouched)."""
    if not GROUND_TRUTH_CSV.exists():
        return {}
    with open(GROUND_TRUTH_CSV, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = set(reader.fieldnames or [])
        has_lang = "lang" in fieldnames
        if not {"image", "text"} <= fieldnames:
            logger.warning(
                "%s exists but doesn't have columns 'image,text' (found: %s) — starting fresh.",
                GROUND_TRUTH_CSV, reader.fieldnames,
            )
            return {}
        if not has_lang:
            logger.warning(
                "%s is in the old format (no `lang` column) — migrating: existing `text` is "
                "kept, `lang` starts blank for you to fill in.",
                GROUND_TRUTH_CSV,
            )
        existing: Dict[str, Tuple[str, str]] = {}
        for row in reader:
            image = (row.get("image") or "").strip()
            if image:
                lang = (row.get("lang") or "") if has_lang else ""
                existing[image] = (lang, row.get("text") or "")
        return existing


def scaffold() -> None:
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    GROUND_TRUTH_CSV.parent.mkdir(parents=True, exist_ok=True)

    images = _list_images()
    existing = _load_existing_rows()

    orphaned = sorted(set(existing) - set(images))
    if orphaned:
        logger.warning(
            "%d row(s) in %s reference images no longer found under %s (left untouched): %s",
            len(orphaned), GROUND_TRUTH_CSV.name, IMAGES_DIR, ", ".join(orphaned),
        )

    new_count = sum(1 for name in images if name not in existing)
    kept_count = len(images) - new_count

    with open(GROUND_TRUTH_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(["image", "lang", "text"])
        for name in images:
            lang, text = existing.get(name, ("", ""))
            writer.writerow([name, lang, text])
        # Preserve orphaned rows too — don't silently drop typed text just
        # because an image was temporarily moved/renamed.
        for name in orphaned:
            lang, text = existing[name]
            writer.writerow([name, lang, text])

    print(f"\n[eval.ocr_scaffold] Wrote {GROUND_TRUTH_CSV}")
    print(f"  Images found:        {len(images)}")
    print(f"  New rows (blank):    {new_count}")
    print(f"  Existing rows kept:  {kept_count}")
    if orphaned:
        print(f"  Orphaned rows kept:  {len(orphaned)} (image file missing — see warning above)")
    if new_count:
        print(f"\nOpen {GROUND_TRUTH_CSV} and fill in `lang` + `text` for the new rows, then run:")
        print("  docker compose exec worker python -m eval.ocr --report-languages   (sanity check first)")
        print("  docker compose exec worker python -m eval.ocr")
    print()


if __name__ == "__main__":
    scaffold()
