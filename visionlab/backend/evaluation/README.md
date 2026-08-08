# VisionLab Evaluation Harness

Offline, quantitative accuracy evaluation for the AI modules in
`app/services/`. This folder is completely separate from the web app —
nothing here is imported by `app/main.py` or the Celery tasks, and running
these scripts never changes app behaviour. They call the exact same service
functions the app calls (`run_detection`, `run_emotion_recognition`,
`run_ocr`, `generate_scene_description`, `generate_stories`,
`synthesise_audio`), just against a labelled test set instead of a live
upload.

## Setup

```bash
cd backend
pip install -r requirements.txt              # if not already installed
pip install -r evaluation/requirements-eval.txt
```

## 1. Get datasets

You provide the test data — it's gitignored (`evaluation/datasets/` and
`evaluation/results/` are both excluded from the repo, so large files and
generated figures never get committed).

### Emotion — `datasets/emotion/<label>/<images>`

Use **FER2013** (Kaggle: `msambare/fer2013`) or **RAF-DB**. Both come as
folders of face crops organised by emotion. Arrange them as:

```
datasets/emotion/
├── happy/img001.jpg, img002.jpg, ...
├── sad/...
├── angry/...
├── fear/...
├── disgust/...
├── surprise/...
└── neutral/...
```

Folder names must match `EMOTION_LABELS` at the top of `evaluate_emotion.py`
(edit that list if you use a dataset with different class names).
A few hundred images per class is enough for a results chapter.

### Detection — `datasets/detection/images/` + `datasets/detection/annotations.json`

Use a subset of **COCO val2017** (cocodataset.org) — VisionLab's detector is
trained on COCO's 80 classes, so this gives directly comparable numbers.
Download `val2017.zip` and `annotations_trainval2017.zip`, then either use
the full `instances_val2017.json`, or (recommended — full val2017 is 5000
images and will take a long time) use `pycocotools.coco.COCO` /
Roboflow / FiftyOne to export a few hundred-image subset in COCO format:

```
datasets/detection/
├── images/000000000139.jpg, ...
└── annotations.json     # COCO format: images[], annotations[], categories[]
```

Any COCO-format export (Roboflow, CVAT, Label Studio) works, not just COCO
itself, as long as category names match what the detector actually predicts
(check `model.names` — for the COCO-pretrained YOLO11 weights this project
ships, that's the standard 80 COCO class names like "person", "car", "dog").

### OCR — `datasets/ocr/<name>.<ext>` + `datasets/ocr/<name>.txt`

Use an **ICDAR** set (e.g. ICDAR 2015, ICDAR 2013 — icdar.org / robustreading
competition sites) or **SVT** (Street View Text). Each image needs a
same-named `.txt` file with the exact expected text:

```
datasets/ocr/
├── img_001.jpg
├── img_001.txt   <- "OPEN 24 HOURS"
├── img_002.jpg
├── img_002.txt
```

### Latency — `datasets/latency/<images>`

Any 10-30 representative images, no ground truth needed — this just times
the pipeline.

### Human rating — `datasets/human_rating/<images>`

A small, deliberately chosen set (10-20 images) — pick ones with genuinely
interesting content, since you're judging the *quality* of generated
scene descriptions and stories, not accuracy against a fixed answer.

## 2. Run each evaluation

All commands run from `backend/`:

```bash
python -m evaluation.evaluate_emotion
python -m evaluation.evaluate_detection
python -m evaluation.evaluate_ocr
python -m evaluation.evaluate_latency
python -m evaluation.human_rating_template generate   # writes the sheet
# ... open results/human_rating_sheet.csv, fill in rating_1_to_5 ...
python -m evaluation.human_rating_template report      # reports avg + stdev
```

Each script prints a clear message and exits (doesn't crash) if its dataset
folder is empty. Corrupt/unreadable images and images the AI module can't
process (e.g. no face found) are counted and reported, never silently
dropped or fatal.

## 3. What lands in `results/` and where it belongs in your report

| File | Contents | Report section |
|---|---|---|
| `emotion_metrics.csv` | Per-class precision/recall/F1/support + macro & weighted averages | Results — Emotion Recognition |
| `emotion_confusion_matrix.png` | Labelled heatmap, true vs predicted | Results — Emotion Recognition (figure) |
| `emotion_summary.txt` | Full text report + no-face / unreadable / multi-face counts | Appendix or Results |
| `detection_metrics.csv` | Per-class AP@0.5, AP@0.5:0.95, overall mAP row | Results — Object Detection |
| `detection_ap_per_class.png` | Bar chart, per-class AP@0.5 vs overall mAP@0.5 | Results — Object Detection (figure) |
| `ocr_metrics.csv` | Per-image CER/WER/exact-match + corpus-level overall row | Results — Text Extraction |
| `latency_metrics.csv` | Mean/median/p95/min/max per stage + end-to-end | Results — Performance |
| `latency_per_stage.png` | Bar chart, mean vs p95 per stage | Results — Performance (figure) |
| `human_rating_sheet.csv` | Raw generated outputs + your filled-in ratings | Appendix (raw data) |
| `human_rating_report.csv` | Mean + std rating per module (scene / story type) | Results — Scene & Story Quality |

## 4. Metric definitions (plain English, for the viva)

- **Accuracy** — of all predictions, what fraction were exactly right.
  Misleading alone when classes are imbalanced (e.g. mostly-neutral faces).

- **Precision** — of everything the model *called* a given class, what
  fraction actually was that class. High precision = few false alarms.

- **Recall** — of everything that actually *was* a given class, what
  fraction the model correctly found. High recall = few misses.

- **F1 score** — the harmonic mean of precision and recall; one number that
  penalises models that are lopsided (e.g. very high precision but very low
  recall). Reported per class, plus **macro** (unweighted average across
  classes — treats rare classes as equally important) and **weighted**
  (averaged by how common each class is in the test set).

- **mAP (mean Average Precision)** — the standard object detection metric.
  For each class, Average Precision (AP) summarises the precision/recall
  trade-off across every confidence threshold into one number (area under
  the precision-recall curve). mAP is the average of AP across all classes.
  **mAP@0.5** counts a detection correct if its box overlaps the true box by
  ≥50% IoU (Intersection-over-Union). **mAP@0.5:0.95** is the stricter,
  COCO-standard version — it averages AP over ten overlap thresholds from
  50% to 95%, so it rewards precisely-located boxes, not just roughly-right
  ones.

- **IoU (Intersection over Union)** — how much a predicted box and the true
  box overlap, as a fraction of their combined area. 1.0 = perfect overlap,
  0 = no overlap at all.

- **CER (Character Error Rate)** — the fraction of characters that would
  need to be inserted, deleted, or substituted to turn the OCR output into
  the correct text (edit distance ÷ reference length). Lower is better;
  0 = perfect.

- **WER (Word Error Rate)** — the same idea as CER, but counting whole
  words instead of characters. Usually higher than CER for the same output,
  since one wrong character can wreck a whole word.

- **Exact-match accuracy** — the fraction of images where the OCR output
  was character-for-character identical to the ground truth. A strict,
  easy-to-explain secondary number alongside CER/WER.

## Design notes worth mentioning in your methodology section

- **Multi-face images and emotion labels**: this dataset format assumes one
  true emotion per image. When the model finds more than one face, the
  harness scores the highest-confidence face and counts how often that
  happened (`multi_face_count` in the summary) — a documented, deliberate
  simplification, not a silent one.
- **No pycocotools**: `evaluate_detection.py` implements COCO's own AP
  method (IoU-matched greedy assignment, 101-point interpolated
  precision-recall, averaged over IoU 0.50-0.95) directly in numpy instead
  of depending on `pycocotools`, which needs a C build step that's
  unreliable on Windows without Visual C++ build tools. Numbers are
  algorithmically equivalent to a `pycocotools`-based run.
- **Confidence floor for mAP**: detection evaluation calls `run_detection`
  with a much lower confidence threshold (0.001) than the app's UI default
  (0.25), so mAP reflects the model's full precision-recall curve rather
  than being artificially capped by a UI-convenience threshold.
- **Corpus-level CER/WER**: OCR error rates are computed across the whole
  dataset's combined edit distance, not averaged per-image, which is the
  standard way to report CER/WER and avoids short strings distorting the
  average.
