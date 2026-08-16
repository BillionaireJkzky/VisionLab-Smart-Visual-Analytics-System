"""
VisionLab eval — OCR character accuracy (1 - CER), via the app's real EasyOCR reader,
grouped per-language for multilingual ground truth.

Ground truth is per-image labelled with an EasyOCR language code (`lang`
column). Images are grouped by that code and OCR'd with a Reader built for
that language — reusing the app's own GPU/config conventions
(`app.services.ocr._resolve_gpu`, the same pre-OCR resize via
`_resize_for_ocr`, `verbose=False`) but choosing the language list per
group rather than going through the app's `_resolve_langs`, which only
special-cases a couple of target languages (see `--report-languages`
below). This is necessary because EasyOCR cannot load arbitrary scripts
into a single Reader — see "Multilingual notes" below — and some scripts
(e.g. Burmese) aren't supported by EasyOCR at all.

Run inside the GPU worker container (from repo root):
    docker compose exec worker python -m eval.ocr_scaffold      # generate/update the CSV from images/
    # ... fill in `lang` and `text` by hand ...
    docker compose exec worker python -m eval.ocr                # validate + score
    docker compose exec worker python -m eval.ocr --report-languages   # just the language report, no OCR

--- Ground truth format ---
    eval/data/ocr/ground_truth.csv   columns: image,lang,text
    eval/data/ocr/images/            the image files referenced by `image`

Example ground_truth.csv:
    image,lang,text
    receipt001.jpg,en,OPEN 24 HOURS
    sign002.png,it,VIETATO L'INGRESSO
    menu003.jpg,ko,김치찌개

`lang` is an EasyOCR language code (en, it, ko, ch_sim, th, ...) — run with
--report-languages to see what your installed EasyOCR supports and check
your ground truth against it before running the full OCR pass. `text` is
the exact expected string (UTF-8). Quote fields in the CSV if they contain
commas or newlines — `eval.ocr_scaffold` and any spreadsheet editor does
this for you automatically.

--- Multilingual notes ---
EasyOCR's recognition models are grouped into mutually-exclusive language
families (Latin, Cyrillic, Arabic, Devanagari, Bengali, and several
single-language-only groups — Chinese Simplified/Traditional, Japanese,
Korean, Thai, Tamil, Telugu, Kannada). Every family *can* pair with
English, but two languages from different families (e.g. Korean + Thai)
CANNOT be loaded into the same Reader — attempting to raises a ValueError
inside EasyOCR. Grouping ground truth by `lang` and building one
`["en", lang]` Reader per group (single-language groups already exclude
each other by construction) sidesteps this entirely. Some codes aren't
supported by EasyOCR at all regardless of grouping (Burmese/`my` is the
notable one for this project) — those rows are skipped and reported as
"unsupported", never scored as if EasyOCR got every character wrong.

--- Fairness notes ---
1. Normalization: both reference and hypothesis are normalised the *same*
   way before scoring — leading/trailing whitespace stripped, internal
   whitespace/newlines collapsed to a single space (Python's `\\s` is
   Unicode-aware, so this also catches non-breaking/full-width spaces).
   Case is preserved by default; pass --ignore-case to fold case on both
   sides instead.
2. Reading order: EasyOCR's `readtext(detail=1)` returns one entry per
   detected box in *detection* order, which is not necessarily natural
   reading order — joining raw would inflate CER even when every character
   is read correctly. Boxes are sorted top-to-bottom then left-to-right (by
   box centroid) before joining into the hypothesis string.
3. Multilingual grouping (this module): scoring Italian text with an
   English-only Reader (or vice versa) would inflate CER for reasons that
   have nothing to do with OCR quality. Each image is OCR'd with a Reader
   that actually knows its script.
"""
from __future__ import annotations

import argparse
import csv
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

from eval._common import DATA_DIR, ensure_app_importable, logger, save_json

ensure_app_importable()

OCR_DATA_DIR = DATA_DIR / "ocr"
GROUND_TRUTH_CSV = OCR_DATA_DIR / "ground_truth.csv"
IMAGES_DIR = OCR_DATA_DIR / "images"

CSV_COLUMNS = ("image", "lang", "text")


def _paths_for(data_dir: Path) -> Tuple[Path, Path]:
    """(ground_truth_csv, images_dir) for a given eval data directory."""
    return data_dir / "ground_truth.csv", data_dir / "images"


def _expected_layout(data_dir: Path) -> str:
    ground_truth_csv, images_dir = _paths_for(data_dir)
    return f"""\
Missing OCR ground truth. Expected layout:

    {ground_truth_csv}   (columns: image,lang,text)
    {images_dir}/         (the image files referenced by the "image" column)

Example ground_truth.csv:
    image,lang,text
    receipt001.jpg,en,OPEN 24 HOURS
    sign002.png,it,VIETATO L'INGRESSO

`lang` is an EasyOCR language code (en, it, ko, ch_sim, th, ...).

Quickest way to get started:
    1. Drop image files into {images_dir}/ (on the host — bind-mounted).
    2. docker compose exec worker python -m eval.ocr_scaffold
    3. Open ground_truth.csv and fill in `lang` and `text` by hand.
    4. docker compose exec worker python -m eval.ocr --report-languages   (sanity check first)
    5. docker compose exec worker python -m eval.ocr
"""

_WHITESPACE_RE = re.compile(r"\s+")


def normalize_text(text: str, case_sensitive: bool = True) -> str:
    """
    Normalise ground-truth and OCR-hypothesis text identically before
    scoring: strip, collapse internal whitespace/newlines to single spaces,
    and optionally fold case. Applying the exact same function to both sides
    is what keeps the CER comparison fair.
    """
    normalized = _WHITESPACE_RE.sub(" ", text).strip()
    if not case_sensitive:
        normalized = normalized.casefold()
    return normalized


def _reading_order_key(box: Sequence[Sequence[float]]) -> Tuple[float, float]:
    xs = [pt[0] for pt in box]
    ys = [pt[1] for pt in box]
    return (sum(ys) / len(ys), sum(xs) / len(xs))


def join_in_reading_order(detections: list) -> str:
    """
    *detections* is EasyOCR's `readtext(detail=1)` output: a list of
    (box, text, confidence) tuples in detection order. Sort by box centroid,
    top-to-bottom then left-to-right, and join — see module docstring.
    """
    ordered = sorted(detections, key=lambda d: _reading_order_key(d[0]))
    return " ".join(text for _, text, *_ in ordered)


def _easyocr_supported_langs() -> set:
    from easyocr.config import all_lang_list
    return set(all_lang_list)


def _reader_langs_for_group(lang: str) -> Tuple[str, ...]:
    """
    Resolve the Reader language list for a ground-truth `lang` group. Every
    EasyOCR-supported language can be paired with 'en' alone (EasyOCR's own
    compatibility check is "is my requested list a subset of this family",
    not "must include the whole family") — see module docstring.
    """
    return ("en",) if lang == "en" else tuple(sorted({"en", lang}))


def print_language_support_report(csv_langs: Optional[Sequence[str]] = None) -> None:
    """
    STEP 1 — report what languages the app's EasyOCR routing is configured
    for, and (if csv_langs is given) which of your ground-truth languages
    installed EasyOCR can and cannot actually handle.
    """
    from app.services.ocr import _resolve_langs

    supported = _easyocr_supported_langs()

    print("\n" + "-" * 60)
    print("VisionLab OCR — language support")
    print("-" * 60)
    print(f"Installed EasyOCR recognises {len(supported)} language codes.")

    print("\napp.services.ocr._resolve_langs(target_language) routing:")
    probes = [
        ("en", "default / anything unrecognised"),
        ("ch", "'ch'/'zh'/'zh-cn'/'ch_sim' -> Chinese Simplified"),
        ("my", "'my'/'burmese' -> Burmese"),
    ]
    for probe, note in probes:
        resolved = _resolve_langs(probe)
        ok = set(resolved) <= supported
        status = "OK" if ok else "BROKEN (EasyOCR doesn't support one of these codes)"
        print(f"  target_language={probe!r:8} -> {resolved}  [{status}] — {note}")
    print(
        "  Any other target_language value silently falls back to ['en'] — "
        "_resolve_langs has no branch for it (e.g. 'it', 'ko', 'th' all just get English)."
    )

    if "my" not in supported:
        print(
            "\nWARNING: installed EasyOCR does NOT support 'my' (Burmese) — it isn't in "
            "easyocr.config.all_lang_list. The app's target_language='my' route builds "
            "Reader(['en','my']), which will fail in production. This is an EasyOCR "
            "limitation, not something this eval script can work around: Burmese OCR "
            "needs a different engine. This eval script SKIPS 'my' ground-truth rows "
            "rather than scoring them as 0% accurate."
        )

    if csv_langs:
        print("\nYour ground_truth.csv languages — can EasyOCR handle them:")
        for lang in sorted(set(csv_langs)):
            can = lang in supported
            if can:
                note = f"OK   -> Reader({list(_reader_langs_for_group(lang))})"
            else:
                note = "SKIP -> not an EasyOCR language code; images will be excluded from CER, not scored as errors"
            print(f"  {lang:10} {note}")
    print()


@dataclass
class OcrSample:
    image_name: str
    lang: str
    reference: str
    hypothesis: str = ""


@dataclass
class ValidationReport:
    total_rows: int = 0
    valid_rows: List[Tuple[str, str, str]] = field(default_factory=list)  # (image, lang, text)
    missing_images: List[str] = field(default_factory=list)
    empty_text: List[str] = field(default_factory=list)
    empty_lang: List[str] = field(default_factory=list)
    has_bom: bool = False


@dataclass
class OcrEvalResult:
    samples: List[OcrSample] = field(default_factory=list)
    unsupported: List[Tuple[str, str]] = field(default_factory=list)  # (image_name, lang)
    missing_image_count: int = 0
    empty_text_count: int = 0
    empty_lang_count: int = 0
    unreadable_count: int = 0
    elapsed_s: float = 0.0
    case_sensitive: bool = True


def validate_ground_truth(data_dir: Path = OCR_DATA_DIR) -> Optional[ValidationReport]:
    """
    Check the ground-truth CSV + images/ folder before any (expensive) OCR
    runs: CSV/folder existence, UTF-8 validity, every `image` exists under
    images/, every row has non-empty `lang` and `text`. Prints exact setup
    instructions if the CSV or images/ folder is missing entirely, instead
    of crashing.
    """
    ground_truth_csv, images_dir = _paths_for(data_dir)

    if not ground_truth_csv.exists() or not images_dir.exists():
        print(f"\n[eval.ocr] {_expected_layout(data_dir)}")
        return None

    raw = ground_truth_csv.read_bytes()
    has_bom = raw.startswith(b"\xef\xbb\xbf")
    try:
        raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        print(
            f"\n[eval.ocr] {ground_truth_csv} is not valid UTF-8 ({exc}).\n"
            f"Re-save the file with UTF-8 encoding and try again.\n"
        )
        return None

    # utf-8-sig transparently strips a leading BOM (harmless either way);
    # we already flagged its presence above for the warning in the report.
    with open(ground_truth_csv, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        required = set(CSV_COLUMNS)
        if reader.fieldnames is None or required - set(reader.fieldnames):
            print(f"\n[eval.ocr] {ground_truth_csv} must have columns: image,lang,text (found: {reader.fieldnames})\n")
            return None
        rows = [
            ((row.get("image") or "").strip(), (row.get("lang") or "").strip(), row.get("text") or "")
            for row in reader
        ]
        rows = [r for r in rows if r[0]]

    report = ValidationReport(total_rows=len(rows), has_bom=has_bom)
    for image_name, lang, text in rows:
        ok = True
        if not (images_dir / image_name).exists():
            report.missing_images.append(image_name)
            ok = False
        if not lang:
            report.empty_lang.append(image_name)
            ok = False
        if not text.strip():
            report.empty_text.append(image_name)
            ok = False
        if ok:
            report.valid_rows.append((image_name, lang, text))
    return report


def _print_validation_report(report: ValidationReport, data_dir: Path = OCR_DATA_DIR) -> None:
    ground_truth_csv, images_dir = _paths_for(data_dir)
    print("\n" + "-" * 60)
    print("OCR ground truth validation")
    print("-" * 60)
    print(f"Rows in CSV:        {report.total_rows}")
    print(f"Valid (scoreable):  {len(report.valid_rows)}")
    if report.has_bom:
        print(
            f"WARNING: {ground_truth_csv.name} starts with a UTF-8 BOM. "
            f"It's stripped automatically here, but re-saving without one avoids "
            f"surprises in other tools (most editors: 'UTF-8' not 'UTF-8 with BOM')."
        )
    if report.missing_images:
        print(f"Missing image files ({len(report.missing_images)}) — listed in the CSV but not found under {images_dir}:")
        for name in report.missing_images:
            print(f"  - {name}")
    if report.empty_lang:
        print(f"Empty `lang` ({len(report.empty_lang)}) — fill these in ground_truth.csv:")
        for name in report.empty_lang:
            print(f"  - {name}")
    if report.empty_text:
        print(f"Empty `text` ({len(report.empty_text)}) — fill these in ground_truth.csv:")
        for name in report.empty_text:
            print(f"  - {name}")
    print()


def run_ocr_evaluation(
    case_sensitive: bool = True, report_only: bool = False, data_dir: Path = OCR_DATA_DIR
) -> Optional[OcrEvalResult]:
    from app.services.ocr import _resize_for_ocr, _resolve_gpu  # reuse the app's preprocessing + GPU resolution

    _, images_dir = _paths_for(data_dir)

    report = validate_ground_truth(data_dir)
    if report is None:
        return None
    _print_validation_report(report, data_dir)

    print_language_support_report([lang for _, lang, _ in report.valid_rows])

    if not report.valid_rows:
        print("[eval.ocr] No scoreable image/ground-truth pairs after validation. Nothing to do.\n")
        return None

    if report_only:
        return None

    import easyocr
    import numpy as np
    from PIL import Image, UnidentifiedImageError

    supported = _easyocr_supported_langs()

    result = OcrEvalResult(
        missing_image_count=len(report.missing_images),
        empty_text_count=len(report.empty_text),
        empty_lang_count=len(report.empty_lang),
        case_sensitive=case_sensitive,
    )

    # Group by ground-truth language so each Reader only ever loads one
    # target script (+ English) at a time — see "Multilingual notes" above.
    groups: Dict[str, List[Tuple[str, str]]] = {}
    for image_name, lang, text in report.valid_rows:
        groups.setdefault(lang, []).append((image_name, text))

    reader_cache: Dict[Tuple[str, ...], "easyocr.Reader"] = {}
    use_gpu = _resolve_gpu()  # same GPU resolution the app uses — only the language list varies per group

    t0 = time.time()
    for lang in sorted(groups):
        images = groups[lang]

        if lang not in supported:
            result.unsupported.extend((image_name, lang) for image_name, _ in images)
            logger.warning(
                "Language '%s' is not supported by installed EasyOCR — skipping %d image(s) "
                "(NOT scored as errors): %s",
                lang, len(images), ", ".join(name for name, _ in images),
            )
            continue

        reader_langs = _reader_langs_for_group(lang)
        if reader_langs not in reader_cache:
            logger.info("Loading EasyOCR reader for lang group %r: langs=%s gpu=%s", lang, reader_langs, use_gpu)
            reader_cache[reader_langs] = easyocr.Reader(list(reader_langs), gpu=use_gpu, verbose=False)
        reader = reader_cache[reader_langs]

        for image_name, reference in images:
            image_path = images_dir / image_name
            try:
                image = Image.open(image_path)
                image.load()
                image = image.convert("RGB")
            except (UnidentifiedImageError, OSError) as exc:
                logger.warning("Skipping unreadable image %s: %s", image_path, exc)
                result.unreadable_count += 1
                continue

            resized = _resize_for_ocr(image)
            img_array = np.asarray(resized)

            try:
                detections = reader.readtext(img_array, detail=1, paragraph=False)
            except Exception as exc:  # noqa: BLE001
                logger.warning("EasyOCR readtext failed on %s: %s", image_name, exc)
                detections = []

            hypothesis = join_in_reading_order(detections)

            result.samples.append(OcrSample(image_name=image_name, lang=lang, reference=reference, hypothesis=hypothesis))
            logger.info("[%s] %-30s ref=%r  hyp=%r", lang, image_name, reference[:40], hypothesis[:40])

    result.elapsed_s = time.time() - t0
    return result


def save_report(result: OcrEvalResult, data_dir: Path = OCR_DATA_DIR) -> dict:
    import jiwer

    if not result.samples and not result.unsupported:
        logger.error("No scoreable image/ground-truth pairs. Nothing to report.")
        return {}

    case_sensitive = result.case_sensitive
    references = [normalize_text(s.reference, case_sensitive) for s in result.samples]
    hypotheses = [normalize_text(s.hypothesis, case_sensitive) for s in result.samples]

    # Corpus-level CER over supported-language images only: jiwer aggregates
    # edit distance across the whole set (total edits / total reference
    # characters) — the standard way to report this, not a naive mean of
    # per-sample rates, which over-weights short ground-truth strings.
    overall_cer = jiwer.cer(references, hypotheses) if result.samples else None
    overall_accuracy = (1.0 - overall_cer) if overall_cer is not None else None

    by_lang: Dict[str, List[int]] = {}
    for idx, s in enumerate(result.samples):
        by_lang.setdefault(s.lang, []).append(idx)

    language_breakdown = []
    for lang in sorted(by_lang):
        idxs = by_lang[lang]
        lang_cer = jiwer.cer([references[i] for i in idxs], [hypotheses[i] for i in idxs])
        language_breakdown.append({
            "lang": lang,
            "num_images": len(idxs),
            "cer": lang_cer,
            "character_accuracy": 1.0 - lang_cer,
        })

    per_image = []
    for s, ref_n, hyp_n in zip(result.samples, references, hypotheses):
        sample_cer = jiwer.cer(ref_n, hyp_n) if ref_n else None
        per_image.append({
            "image": s.image_name,
            "lang": s.lang,
            "reference": s.reference,
            "hypothesis": s.hypothesis,
            "reference_normalized": ref_n,
            "hypothesis_normalized": hyp_n,
            "cer": sample_cer,
        })

    unsupported_list = [{"image": name, "lang": lang} for name, lang in result.unsupported]

    payload = {
        "component": "ocr",
        "metric": "character_accuracy",
        "cer": overall_cer,
        "character_accuracy": overall_accuracy,
        "num_samples": len(result.samples),
        "num_unsupported_language": len(result.unsupported),
        "missing_images": result.missing_image_count,
        "empty_text_rows": result.empty_text_count,
        "empty_lang_rows": result.empty_lang_count,
        "unreadable_images": result.unreadable_count,
        "case_sensitive": case_sensitive,
        "elapsed_s": round(result.elapsed_s, 1),
        "languages": language_breakdown,
        "unsupported": unsupported_list,
        "samples": per_image,
    }

    print("\n" + "=" * 60)
    print("OCR — CHARACTER ACCURACY (1 - CER)")
    print("=" * 60)
    if overall_cer is not None:
        print(f"Overall CER (supported-language images only): {overall_cer:.3f}")
        print(f"Overall Character Accuracy:                   {overall_accuracy:.3f}")
    else:
        print("Overall CER: n/a — no supported-language images were scored")
    print(f"Samples scored:              {len(result.samples)}")
    print(f"Skipped (unsupported lang):  {len(result.unsupported)}")
    print(f"Unreadable images:           {result.unreadable_count}")
    print(f"Case-sensitive:              {case_sensitive}")
    print(f"Elapsed: {result.elapsed_s:.1f}s")

    if language_breakdown:
        print("\nPer-language breakdown:")
        print(f"  {'lang':<8} {'images':>6} {'CER':>8} {'accuracy':>10}")
        for row in language_breakdown:
            print(f"  {row['lang']:<8} {row['num_images']:>6} {row['cer']:>8.3f} {row['character_accuracy']:>10.3f}")

    if unsupported_list:
        print("\nSkipped — unsupported language (NOT counted as errors, not included in CER above):")
        for row in unsupported_list:
            print(f"  {row['image']:<32} lang={row['lang']}")

    if per_image:
        print("\nPer-image CER (worst first):")
        print(f"  {'image':<32} {'lang':<8} {'CER':>8}")
        for row in sorted(per_image, key=lambda r: (r["cer"] is None, -(r["cer"] or 0.0))):
            cer_str = f"{row['cer']:.3f}" if row["cer"] is not None else "n/a"
            print(f"  {row['image']:<32} {row['lang']:<8} {cer_str:>8}")
    print()

    save_json(data_dir.name, payload)
    return payload


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--ignore-case", action="store_true",
        help="Case-insensitive scoring (default: case-sensitive, matching the app's raw OCR output).",
    )
    parser.add_argument(
        "--report-languages", action="store_true",
        help="Print validation + the language-support report (STEP 1) and exit without running any OCR.",
    )
    parser.add_argument(
        "--data-dir", type=Path, default=None,
        help=(
            f"Eval data directory containing ground_truth.csv + images/ (default: {OCR_DATA_DIR}). "
            "Results are saved to eval/results/<data-dir-name>.json, so pointing this at a "
            "separate dataset (e.g. eval/data/ocr_textocr) never overwrites the default ocr.json."
        ),
    )
    return parser.parse_args()


if __name__ == "__main__":
    ns = _parse_args()
    data_dir = ns.data_dir if ns.data_dir is not None else OCR_DATA_DIR
    outcome = run_ocr_evaluation(case_sensitive=not ns.ignore_case, report_only=ns.report_languages, data_dir=data_dir)
    if outcome is not None:
        save_report(outcome, data_dir=data_dir)
