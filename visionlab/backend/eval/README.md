# VisionLab `eval/` — Real Accuracy Numbers

Measures the actual evaluation metrics for the object-detection and OCR
components that the app ships with, so you can fill a benchmark table with
real numbers instead of guesses. Emotion recognition is already evaluated
elsewhere; `eval/emotion.py` is included only as an optional, reproducible
script.

This module is completely separate from the web app — nothing here is
imported by `app/main.py` or the Celery tasks, and running these scripts
never changes app behaviour. Detection and OCR call the app's own service
code (`app.services.detection.MODEL_PATHS`, `app.services.ocr._get_reader`)
so results reflect the exact models/config the deployed system uses.

Every metric uses the standard definition:
- **mAP** = area under the interpolated precision-recall curve (via
  Ultralytics' own validator), **not** precision × recall.
- **CER** = edit distance ÷ reference length (via `jiwer`), corpus-level.
- **Macro F1** = per-class F1 averaged across classes (via `scikit-learn`).

## Setup

Run everything inside the GPU worker container — it already has the app's
models and, once you rebuild the image, the eval dependencies too.

```bash
# after adding jiwer/scikit-learn to requirements.txt:
docker compose build worker
docker compose up -d worker

# confirm GPU is visible inside the container:
docker compose exec worker python -c "import torch; print(torch.cuda.is_available())"
```

## 1. Object detection — `eval/detection.py`

Uses Ultralytics' built-in validator (`DetectionValidator`), which computes
mAP the correct way (PR-curve area), against the exact weights
`app.services.detection` loads for the requested tier
(`fast` → `yolo11n.pt`, `balanced`/`advanced` → `yolo11s.pt`).

No manual annotation needed — the detector is pretrained on COCO, so it's
evaluated on COCO. The smoke test uses `coco128.yaml` (bundled with
Ultralytics, auto-downloads ~7MB). `--full` uses `eval/coco_val.yaml` — COCO
val2017 **only** (5000 images, ~1GB) — not Ultralytics' own `coco.yaml`,
which pulls train2017 + val2017 + test2017 (~26GB) unconditionally even
though validation never touches train/test. See `eval/coco_val.yaml`'s
header and `_ensure_coco_val_ready()` in `eval/detection.py` for how the
download is scoped to val2017 only, and made idempotent (safe to rerun —
skips the download once 5000 images are present).

```bash
# Quick smoke test — 128 images, auto-downloaded, may overlap training data.
docker compose exec worker python -m eval.detection

# The number to actually report — COCO val2017 ONLY, 5000 held-out images
# (~1GB download, first run only; cached in the coco_cache volume after that).
docker compose exec worker python -m eval.detection --full

# Evaluate a different detector tier:
docker compose exec worker python -m eval.detection --full --model-key fast
```

**Dataset persistence**: `docker-compose.yml` mounts a named volume
(`coco_cache:/app/datasets`) on the `worker` service, so the downloaded
COCO labels/images survive `docker compose build` / container recreation —
`--full` only pays the ~1GB download once, not on every rebuild.

**Own dataset option**: if you later annotate your own test images
(Roboflow / CVAT, exported as YOLO format — `images/` + `labels/` +
`data.yaml`), point `--data` at that yaml instead:

```bash
docker compose exec worker python -m eval.detection --data /path/to/my_dataset.yaml
```

Prints and saves (`eval/results/detection_<model_key>.json`): `mAP@0.5`,
`mAP@0.5:0.95`, precision, recall, and the number of images evaluated.

## 2. OCR — `eval/ocr.py` + `eval/ocr_scaffold.py`

Runs the app's actual EasyOCR setup (`app.services.ocr._resolve_gpu`, the
same pre-OCR resize) against a small ground-truth set you provide, grouped
**per language**, and computes corpus-level CER and Character Accuracy
(`1 - CER`) with `jiwer` — overall and broken down per language.

**Ground truth format** — you provide:

```
eval/data/ocr/ground_truth.csv   # columns: image,lang,text
eval/data/ocr/images/            # the image files referenced by "image"
```

Example `ground_truth.csv`:

```csv
image,lang,text
receipt001.jpg,en,OPEN 24 HOURS
sign002.png,it,VIETATO L'INGRESSO
menu003.jpg,ko,김치찌개
```

- `lang` is an **EasyOCR language code** (`en`, `it`, `ko`, `ch_sim`, `th`,
  ...) — not a free-form name. Run `--report-languages` (below) to check
  what your installed EasyOCR actually supports before typing these in.
- `text` is the exact expected string, UTF-8 encoded. Quote fields that
  contain commas or newlines (`eval.ocr_scaffold` and any spreadsheet
  editor does this for you automatically).
- Save the file as plain **UTF-8** (not "UTF-8 with BOM") if your editor
  offers the choice — a BOM is tolerated and stripped automatically, but
  `eval.ocr` will print a warning, and a couple of other CSV tools choke
  on it.
- `ground_truth.csv` from before the `lang` column existed is read and
  migrated automatically by `eval.ocr_scaffold` — existing `text` is kept,
  `lang` starts blank for you to fill in.

**Building a test set**: aim for a small (~30-image) but *varied* set,
since a set of similar images will only tell you how EasyOCR does on that
one style. A reasonable mix:

- printed body text (documents, book pages)
- signs / storefronts / street signs (varied fonts, angles, lighting)
- UI screenshots (small, dense, uniform font)
- a little handwriting, if the app is expected to see any (EasyOCR is
  weakest here — worth knowing the real number rather than assuming)
- multiple scripts/languages, if the app is expected to see any (see
  below — some scripts EasyOCR can't recognise at all, and that needs to
  show up as "unsupported", not as a bad accuracy number)

**Multilingual notes — why this matters**: EasyOCR only recognises the
languages its `Reader` was constructed with, and it can't load arbitrary
scripts into one `Reader` — e.g. Korean + Thai in the same `Reader` raises
a `ValueError` (EasyOCR groups languages into mutually-exclusive families:
Latin, Cyrillic, Arabic, Devanagari, Bengali, and several
single-language-only families — Chinese Simplified/Traditional, Japanese,
Korean, Thai, Tamil, Telugu, Kannada — each of which can only pair with
English, never with each other). `eval.ocr` handles this by grouping
ground-truth rows by their `lang` column and OCR-ing each group with its
own `Reader(["en", lang])`. Some codes aren't supported by EasyOCR at all
regardless of grouping — **Burmese (`my`) is the notable one**: it isn't
in EasyOCR's supported language list, even though
`app.services.ocr._resolve_langs` has a `'my'` route that builds
`Reader(['en','my'])` — that route is broken in production, EasyOCR simply
doesn't have a Burmese model. `eval.ocr` skips `my` (and any other
EasyOCR-unsupported code) and reports it separately as **unsupported** —
it is never scored as 0% accurate, since that would blame the model for
something it was never capable of.

**Workflow**:

```bash
# 1. Drop image files on the host — eval/data/ is bind-mounted, so files
#    dropped in visionlab/backend/eval/data/ocr/images/ appear in the
#    container immediately, no rebuild needed.

# 2. Generate/update ground_truth.csv from whatever's in images/.
#    Never overwrites lang/text you've already typed in; only adds new
#    blank rows for new images.
docker compose exec worker python -m eval.ocr_scaffold

# 3. Open ground_truth.csv on the host and fill in `lang` + `text`
#    by hand for each new row.

# 4. (Optional but recommended first) check language support without
#    running any OCR — see STEP 1 below.
docker compose exec worker python -m eval.ocr --report-languages

# 5. Validate + score.
docker compose exec worker python -m eval.ocr
```

**STEP 1 — language support report** (`--report-languages`, and printed
automatically at the top of every `eval.ocr` run): prints how many
language codes your installed EasyOCR recognises, how
`app.services.ocr._resolve_langs` routes the app's own `target_language`
values (flagging the broken `'my'` route), and — once your CSV has `lang`
values filled in — a CAN/CANNOT line per language in your ground truth, so
you know before an expensive multi-reader OCR pass which images will
actually get scored.

`eval.ocr` also validates the ground truth before running any OCR: checks
the CSV and images folder both exist (prints the exact expected layout
above and exits cleanly if not), that the CSV is valid UTF-8, that every
`image` exists under `images/`, and that every row has non-empty `lang`
and `text`. It prints a report of what it found before scoring only the
valid rows.

**Fair CER — three things this script corrects for**:

1. **Normalization.** Both the ground-truth text and the OCR hypothesis are
   run through the exact same normalization before scoring: strip
   leading/trailing whitespace, collapse internal whitespace/newlines to a
   single space (Unicode-aware, so non-breaking/full-width spaces count
   too). Case is preserved by default — pass `--ignore-case` to fold case
   on both sides instead.
2. **Reading order.** EasyOCR's detector returns one result per detected
   text box in *detection* order, which isn't necessarily top-to-bottom,
   left-to-right — naively joining raw would inflate CER (via spurious
   word-order edits) even when every character was read correctly. This
   script sorts detected boxes top-to-bottom then left-to-right (by box
   centroid) before joining them into the hypothesis string.
3. **Language grouping.** Scoring Italian text against an English-only
   Reader (or vice versa) would inflate CER for reasons that have nothing
   to do with OCR quality. Each image is OCR'd with a Reader that actually
   knows its script (see "Multilingual notes" above), and images in
   languages EasyOCR can't recognise at all are excluded from CER rather
   than counted as errors.

```bash
docker compose exec worker python -m eval.ocr                    # validate + score, case-sensitive
docker compose exec worker python -m eval.ocr --ignore-case       # fold case on both sides
docker compose exec worker python -m eval.ocr --report-languages  # STEP 1 report only, no OCR
```

Prints overall CER/Character Accuracy (over supported-language images
only), a **per-language breakdown** (images/CER/accuracy per `lang`), the
list of images skipped for unsupported language, and a per-image CER table
(worst first, with `lang`) so you can spot outliers. Saves
(`eval/results/ocr.json`): overall CER/accuracy, the `languages` breakdown,
the `unsupported` list, sample/skip counts, the case-sensitivity setting
used, and per-image reference/hypothesis/CER (both raw and normalized).

## 3. Emotion recognition — `eval/emotion.py` (optional)

Calls `DeepFace.analyze(actions=['emotion'], enforce_detection=False)`
directly against a labelled folder and reports Accuracy, Macro F1, the full
classification report, and a confusion matrix (via `scikit-learn`).

**You must provide:**

```
eval/data/emotion/<label>/<image files>
```

where `<label>` is one of DeepFace's 7 output classes — `angry`, `disgust`,
`fear`, `happy`, `sad`, `surprise`, `neutral` — or maps onto them via
`LABEL_MAP` at the top of `eval/emotion.py` if your dataset uses different
folder names.

```bash
docker compose exec worker python -m eval.emotion
```

Prints and saves (`eval/results/emotion.json`): accuracy, macro F1, the
per-class classification report, and the confusion matrix.

## 4. Fill the benchmark table — `eval/summarise.py`

Reads whatever `eval/results/*.json` files exist and prints a markdown
table with each component's primary metric, ready to paste into a report.

```bash
docker compose exec worker python -m eval.summarise
```

```
| Component | Dataset Size | Primary Metric | Score |
|---|---|---|---|
| YOLO11 (yolo11s.pt, balanced) | coco.yaml (5000 imgs) | mAP@0.5 | 0.XXX |
| EasyOCR | N imgs | Character Accuracy (1-CER) | 0.XXX |
| DeepFace | N imgs | Macro F1 | 0.XXX |
```

## Notes

- `eval/data/` and `eval/results/` are gitignored (except `.gitkeep`
  placeholders) — ground truth and generated numbers never land in the repo.
- `eval/detection.py` defaults to fp32 for validation. fp16 (`--half`) was
  found to silently zero out every metric in testing on this project's GPU —
  if you pass `--half`, sanity-check the output isn't all zero before
  trusting it.
- `eval/detection.py` defaults `--workers 0` for the validation dataloader.
  Docker's default `/dev/shm` (64 MB) is too small for PyTorch's
  multiprocessing dataloader workers and fails with
  `RuntimeError: unable to allocate shared memory`; `workers=0` avoids it
  without needing to change container shm-size.
- `--full` downloads via `eval/detection.py`'s own pre-flight check, not
  Ultralytics' auto-download trigger inside the validator — that trigger
  only checks that `val2017.txt` *exists*, not that the images it lists do,
  so an interrupted download (e.g. Ctrl-C mid-run) can leave it satisfied
  while `images/val2017/` is actually empty or partial. The pre-flight
  check counts real image files and only downloads what's missing.
