# VisionLab — Phase 0 Audit Report

**Date:** 2026-05-17  
**Auditor:** Claude (senior staff engineer, automated)  
**Scope:** Full codebase — `backend/` + `frontend/`  
**Project:** Si Thu Aung, Student 2631597, University of Wolverhampton, MSc Final Year Project  
**Module:** 6CS007/FM2 — Supervised by Dr Aye Aye & Dr Phyu Thwe

---

## 1. Architecture Overview

```mermaid
graph TD
    subgraph Browser
        UI[React 18 + Vite 5]
        LS[localStorage — JWT]
    end

    subgraph "Docker Host"
        subgraph "FastAPI (uvicorn)"
            MW[Middleware: RequestID + RateLimit]
            Auth[/auth]
            Analysis[/analysis]
            Vocab[/vocabulary]
            Admin[/admin]
            Health[/health]
            Static["/images /audio static"]
        end

        subgraph "Celery Worker"
            Pipeline[pipeline.py task]
            Detection[YOLO v8]
            Emotion[DeepFace]
            OCR[EasyOCR]
            Scene[GIT/BLIP]
            Story[Gemini 2.0 Flash]
            TTS[gTTS]
            Annotate[PIL annotation]
        end

        Redis[(Redis — broker + cache)]
        Postgres[(PostgreSQL)]
        FileSystem[image_outputs/ audio_outputs/]
    end

    Browser -->|HTTPS / Axios| MW
    MW --> Auth
    MW --> Analysis
    MW --> Vocab
    MW --> Admin
    Auth -->|JWT| LS
    Analysis -->|enqueue| Redis
    Redis -->|consume| Pipeline
    Pipeline --> Detection
    Pipeline --> Emotion
    Pipeline --> OCR
    Pipeline --> Scene
    Pipeline --> Story
    Pipeline --> TTS
    Pipeline --> Annotate
    Pipeline -->|write result| Postgres
    Pipeline -->|write files| FileSystem
    FastAPI -->|SQLAlchemy async| Postgres
    Static --> FileSystem
```

**Request / data flow (happy path):**
1. User uploads image → `POST /api/v1/analysis/upload` → task enqueued → returns `task_id`
2. Frontend polls `GET /api/v1/analysis/tasks/{task_id}` every 2 s
3. Celery worker runs pipeline steps sequentially; each step updates `progress_message`
4. On completion, annotated image + result written to DB + filesystem
5. Frontend fetches `GET /api/v1/analysis/result/{task_id}` → renders ResultPage with quiz

---

## 2. Quality Scorecard

| Layer | Score | Rationale |
|---|---|---|
| **FastAPI backend (API layer)** | 7/10 | Clean routing, good schema validation, bounded query params, `Query(ge/le)` guards in place. Gaps: no CORS config visible in code, no CSP middleware, no global exception handler. |
| **Database / models** | 6/10 | Solid SQLAlchemy async patterns. Missing Alembic migrations for recently-added indexes. `create_all` in lifespan is not production-safe. No FK cascade rules defined. |
| **Celery pipeline** | 7/10 | Warm-up via `worker_ready`, retry logic fixed, cancel detection correct. Risk: single monolithic task — one step failure retries the whole chain from step 1. No per-step idempotency. |
| **AI services** | 7/10 | Good: fp16 CUDA, `torch.inference_mode`, `@functools.lru_cache` on model loaders, image pre-resizing. Gap: GIT model emits `[ unused0 ]` artifacts (fix in place); emotion service has no fallback when DeepFace's target_emotions subset throws. |
| **Security** | 5/10 | JWT stored in localStorage (XSS), no CSP headers, no HTTPS enforcement, rate limiter fails open, Dockerfiles run as root. Timing-attack fix in place. |
| **Frontend (React)** | 6/10 | Route-based code splitting, GlobalErrorBoundary, responsive Tailwind. Missing: `/images` dev proxy, no accessibility audit, no loading skeletons in several pages, `window.confirm` replaced in HistoryPage only. |
| **Testing** | 3/10 | Two test files found (`test_detection.py`, `test_quiz.py`). No integration tests, no E2E, no frontend tests. `test_quiz.py` currently broken (assertion mismatch). |
| **DevOps / Docker** | 4/10 | No non-root user, no `HEALTHCHECK`, backend Dockerfile single-stage (pip installs in final image), frontend Dockerfile header text references backend. No `docker-compose` prod config. |
| **Documentation** | 5/10 | `.env.example` is comprehensive. Large changelog docstrings in 6 service files. No API docs customisation. No architecture docs (this audit fills that gap). |
| **Accessibility** | 4/10 | No `axe-core` or `@testing-library/jest-dom` in dependencies. Several interactive elements lack ARIA labels. Quiz radio inputs use custom rendering without `role` annotations. Image annotations have no alt text. |

**Overall: 54/100**

---

## 3. Top 20 Issues — Ranked by Severity

### SEV-1: Critical (Data loss / Security breach risk)

---

#### #1 — JWT stored in localStorage (XSS attack surface)
**File:** [frontend/src/services/api.ts:19](../frontend/src/services/api.ts#L19)  
**OWASP:** A02:2021 Cryptographic Failures, A07:2021 Identification and Authentication Failures  
**Impact:** Any XSS on any page can steal the JWT and fully impersonate the user.  
**Fix:** Move token to `httpOnly` cookie; update FastAPI to read `Authorization` from cookie; add `SameSite=Strict; Secure` attributes.

---

#### #2 — `create_all` in lifespan replaces Alembic migrations
**File:** [backend/app/main.py](../backend/app/main.py) — `lifespan` function  
**Impact:** New indexes added to `models.py` during this session will **never be created** on any existing database. `create_all` is a no-op when the table already exists.  
**Fix:** Remove `create_all` from lifespan. Add an Alembic migration for all three new indexes (`ix_analysis_tasks_user_created`, `ix_analysis_tasks_status`, `ix_vocabulary_user_review`). Add `autogenerate` check to CI.

---

#### #3 — `test_quiz.py` asserts wrong value (broken since SM-2 fix)
**File:** [backend/tests/test_quiz.py](../backend/tests/test_quiz.py) — line with `assert quality_from_correctness(False) == 1`  
**Impact:** Test suite currently fails. CI/CD would block all deployments. The assertion should be `== 0` (complete blackout = maximum EF penalty).  
**Fix:** Change assertion to `== 0`.

---

### SEV-2: High (Functional bugs / Data integrity)

---

#### #4 — `/images` proxy missing from Vite dev config
**File:** [frontend/vite.config.ts](../frontend/vite.config.ts) — `server.proxy` block  
**Impact:** Annotated images returned as `/images/<uuid>.jpg` never load in development. The analysis result page shows broken image icons, making the primary feature untestable locally.  
**Fix:** Add `'/images': { target: 'http://localhost:8000', changeOrigin: true }` to the proxy block (alongside the existing `/api` and `/audio` proxies).

---

#### #5 — `IMAGE_OUTPUT_DIR` in `main.py` conflicts with `settings.image_dir`
**File:** [backend/app/main.py](../backend/app/main.py) — `IMAGE_OUTPUT_DIR = Path("image_outputs")` + static mount  
**Impact:** `main.py` creates a *relative* `image_outputs/` directory (relative to CWD at startup) and mounts it as the static file server. `annotate.py` now correctly writes to `settings.image_dir` (absolute). If CWD differs between startup and worker, the two paths can diverge — images written by the worker won't be served.  
**Fix:** Replace `IMAGE_OUTPUT_DIR = Path("image_outputs")` with `from app.core.config import settings` and use `settings.image_dir` for the static mount.

---

#### #6 — Rate limiter fails open when Redis is unavailable
**File:** [backend/app/core/middleware.py](../backend/app/core/middleware.py) — `RateLimitMiddleware`  
**Impact:** If Redis goes down (or is misconfigured), the `except Exception: pass` swallows all errors and every request is allowed through without rate limiting. A single bad actor can hammer AI inference endpoints.  
**Fix:** Log the Redis error at WARNING level. Consider failing closed for authenticated routes during prolonged Redis outages, or at minimum add a Prometheus counter for missed rate-limit checks.

---

#### #7 — Monolithic Celery task — no per-step idempotency
**File:** [backend/app/tasks/pipeline.py](../backend/app/tasks/pipeline.py)  
**Impact:** If step 5 (story generation) fails and Celery retries the task, steps 1-4 (detection, emotion, OCR, scene) re-run from scratch. This wastes GPU time, triggers duplicate DB writes, and generates duplicate image files.  
**Fix (medium term):** Persist per-step results to the DB or Redis as they complete; at retry, skip already-completed steps. Short-term: lower `max_retries` to 1 for the Gemini step since it's the most likely to fail transiently.

---

### SEV-3: Medium (Performance / Reliability)

---

#### #8 — No CORS configuration
**File:** [backend/app/main.py](../backend/app/main.py)  
**Impact:** If the frontend is ever served from a different origin (different port, CDN, staging URL), all requests will be blocked by the browser with CORS errors.  
**Fix:** Add `CORSMiddleware` with an explicit allowed-origins list from `settings`. Do not use `allow_origins=["*"]` in production.

---

#### #9 — No CSP or security headers
**File:** [backend/app/main.py](../backend/app/main.py) / [backend/app/core/middleware.py](../backend/app/core/middleware.py)  
**OWASP:** A05:2021 Security Misconfiguration  
**Impact:** No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, or `Strict-Transport-Security` headers. Browser is unprotected against clickjacking, MIME-sniffing, and mixed-content attacks.  
**Fix:** Add a `SecurityHeadersMiddleware` or configure the reverse proxy (nginx) to inject standard security headers.

---

#### #10 — Dockerfile runs as root; no HEALTHCHECK
**Files:** [backend/Dockerfile](../backend/Dockerfile), [frontend/Dockerfile](../frontend/Dockerfile)  
**OWASP:** A05:2021 Security Misconfiguration  
**Impact:** A container escape or RCE vulnerability gives the attacker root on the host. No `HEALTHCHECK` means Docker and orchestrators (Kubernetes) cannot detect a crashed or hung process.  
**Fix:** Add `RUN adduser --no-create-home appuser && USER appuser` before `CMD`. Add `HEALTHCHECK CMD curl -f http://localhost:8000/health || exit 1`.

---

#### #11 — Backend Dockerfile single-stage (build tools in production image)
**File:** [backend/Dockerfile](../backend/Dockerfile)  
**Impact:** pip, gcc, and build headers remain in the final image, increasing attack surface and image size unnecessarily.  
**Fix:** Multi-stage build — compile wheels in a builder stage, copy only `.whl` files and source to the final `python:3.11-slim` stage.

---

#### #12 — No global exception handler (500 errors leak stack traces)
**File:** [backend/app/main.py](../backend/app/main.py)  
**Impact:** Unhandled exceptions return a raw 500 with Python traceback in the response body — leaks file paths, module names, and internal logic to clients.  
**Fix:** Add `@app.exception_handler(Exception)` that logs the traceback server-side and returns a generic `{"detail": "Internal server error"}` with a `request_id` for correlation.

---

#### #13 — SM-2 review endpoint has no upper bound on returned items
**File:** [backend/app/api/vocabulary.py:74](../backend/app/api/vocabulary.py#L74)  
**Impact:** `.limit(200)` added for review words is better, but a user with thousands of overdue words still receives a large payload. The progress endpoint caps at 500 items — the frontend renders all of them without virtualisation.  
**Fix:** Accept `limit`/`offset` parameters on both vocabulary endpoints (same `Query(ge=1, le=50)` pattern used in analysis).

---

#### #14 — Polling interval hardcoded; no exponential back-off
**File:** [frontend/src/pages/AnalysisPage.tsx](../frontend/src/pages/AnalysisPage.tsx) — polling `setInterval`  
**Impact:** Frontend polls the status endpoint every 2 seconds regardless of how many tasks are queued. A class of 30 students submitting simultaneously generates 30 × 0.5 req/s = 15 req/s of status polling alone.  
**Fix:** Start at 2 s, double each poll up to 10 s, reset to 2 s on status change. Cancel the interval when the component unmounts (verify current implementation cleans up correctly).

---

#### #15 — Remaining changelog docstrings in 6 service files
**Files:** `celery_app.py`, `story.py`, `emotion.py`, `ocr.py`, `detection.py`, `tts.py`  
**Impact:** Multi-line "changelog" comments document *when* code was added, not *why*. They are noise that increases file size, misleads readers (references old function signatures), and should live in git history.  
**Fix:** Delete all `"""Changelog:` / `# ──────────` block comments. Keep only the rare non-obvious WHY comment.

---

### SEV-4: Low / Accessibility

---

#### #16 — Quiz radio inputs lack accessible labels
**File:** [frontend/src/pages/ResultPage.tsx](../frontend/src/pages/ResultPage.tsx) — `QuizPanel`  
**WCAG:** 1.3.1 Info and Relationships (Level A)  
**Impact:** Screen readers cannot associate the radio button with its label text. Users relying on assistive technology cannot complete the quiz.  
**Fix:** Wrap each option in `<label htmlFor={id}>` with a matching `id` on the `<input>`. Or use `aria-labelledby`.

---

#### #17 — Annotated image has no alt text
**File:** [frontend/src/pages/ResultPage.tsx](../frontend/src/pages/ResultPage.tsx) — annotated image `<img>`  
**WCAG:** 1.1.1 Non-text Content (Level A)  
**Impact:** Blind users cannot access the primary analysis output.  
**Fix:** Generate a descriptive alt string from detections: `alt={detections.map(d => d.label).join(', ') + ' detected in image'}`.

---

#### #18 — No loading skeletons on HistoryPage and ProgressPage
**Files:** [frontend/src/pages/HistoryPage.tsx](../frontend/src/pages/HistoryPage.tsx), [frontend/src/pages/ProgressPage.tsx](../frontend/src/pages/ProgressPage.tsx)  
**Impact:** Pages show blank white space while data loads, causing CLS (Cumulative Layout Shift) and a poor perceived-performance experience.  
**Fix:** Add `<Skeleton>` placeholder cards (Tailwind `animate-pulse` divs) matching the expected layout.

---

#### #19 — No `axe-core` / accessibility test tooling
**File:** [frontend/package.json](../frontend/package.json)  
**Impact:** Accessibility regressions are invisible without automated checking. WCAG 2.2 Level AA compliance cannot be verified.  
**Fix:** Add `@axe-core/react` in dev dependencies; mount `axe` in `main.tsx` behind `import.meta.env.DEV`. Add `@testing-library/jest-dom` + `vitest` for component tests.

---

#### #20 — Frontend Dockerfile description references backend build
**File:** [frontend/Dockerfile](../frontend/Dockerfile) — header comment  
**Impact:** Minor confusion for new contributors setting up the project. Low severity but signals documentation debt.  
**Fix:** Update the Dockerfile comment to accurately describe the frontend multi-stage build.

---

## 4. Tech Debt Hotspots

| File | Debt |
|---|---|
| `backend/app/tasks/pipeline.py` | Monolithic 400-line task; no per-step checkpointing; all steps retry together |
| `backend/app/main.py` | `create_all` masks migration need; `IMAGE_OUTPUT_DIR` duplicates `settings.image_dir`; no CORS; no security headers; no global exception handler |
| `backend/app/core/middleware.py` | Rate limiter silently fails open; no observability hooks |
| `frontend/vite.config.ts` | Missing `/images` proxy (dev images broken) |
| `backend/tests/` | Only 2 test files; `test_quiz.py` broken; 0% coverage on API, pipeline, services |

---

## 5. Performance Bottlenecks

1. **Sequential AI pipeline** — Detection → Emotion → OCR → Scene run back-to-back on the same image. Emotion and OCR are independent; they could run concurrently with `asyncio.gather` or as separate Celery sub-tasks.
2. **No HTTP caching on static assets** — Annotated images and audio files are served without `Cache-Control` headers. Every revisit re-downloads the files.
3. **Polling at fixed 2 s interval** — see Issue #14. On a heavily queued system, polling before the task is even scheduled is pure waste.
4. **`lru_cache` on model loaders** — this is correct, but `maxsize=None` means models are never evicted. On a GPU with limited VRAM, loading all models simultaneously may cause OOM. Consider lazy loading with explicit eviction.
5. **ResultPage renders all detection boxes client-side** — no virtual scrolling for the detection list; with 50+ objects this can cause layout jank.

---

## 6. Security Risks (OWASP Top 10 Mapping)

| OWASP 2021 | Risk | Status |
|---|---|---|
| A01 Broken Access Control | `/vocabulary/progress/{user_id}` correctly checks `current_user.id == user_id`. Admin check on analytics. | ✅ Mitigated |
| A02 Cryptographic Failures | JWT in localStorage (XSS-extractable) | ⚠️ Issue #1 |
| A03 Injection | SQLAlchemy parameterised queries throughout; no raw SQL | ✅ Mitigated |
| A04 Insecure Design | Single monolithic retry task can replay AI calls | ⚠️ Issue #7 |
| A05 Security Misconfiguration | No CORS, no CSP, no security headers, root Docker user, no HEALTHCHECK | ⚠️ Issues #8 #9 #10 |
| A06 Vulnerable Components | Dependencies not pinned to patch versions in `requirements.txt` | ⚠️ Minor |
| A07 Auth Failures | Timing attack fixed (DUMMY_HASH). Token expiry handled via `auth-expired` event. | ✅ Mitigated |
| A08 Software & Data Integrity | No `docker image` signing or SBOMs | ℹ️ Out of scope |
| A09 Security Logging | `request_id` middleware exists. No structured JSON logging to SIEM. | ⚠️ Minor |
| A10 SSRF | Gemini API called with model-generated text prompt only — no user-supplied URLs | ✅ Mitigated |

---

## 7. Accessibility Gaps (WCAG 2.2 Level AA)

| Criterion | Level | Gap | File |
|---|---|---|---|
| 1.1.1 Non-text Content | A | Annotated image `<img>` has no `alt` | ResultPage.tsx |
| 1.3.1 Info and Relationships | A | Quiz radio inputs not associated with labels | ResultPage.tsx |
| 1.4.3 Contrast (Minimum) | AA | Glassmorphism overlays may fail 4.5:1 ratio — not verified | Layout.tsx, SurfaceCard |
| 2.1.1 Keyboard | A | Custom font picker opens on click only — no keyboard open/close | Layout.tsx |
| 2.4.3 Focus Order | A | Modal/panel focus not trapped; Tab can escape modals | HistoryPage.tsx |
| 4.1.2 Name, Role, Value | A | Loading spinner has no `aria-label` or `role="status"` | Multiple pages |
| 2.5.3 Label in Name | A | Icon-only buttons (delete, cancel) need `aria-label` | HistoryPage.tsx |

---

## 8. Summary: What Needs to Happen Before Submission

The codebase is **functionally solid** for an MSc project — the AI pipeline works, the SM-2 quiz is correctly implemented, authentication is present, and the UI is polished. The gaps above are primarily security hardening, DevOps hygiene, and accessibility items that would be expected in a production deployment.

**Before any exam submission:**
- Fix the broken test (#3) — graded tests must pass
- Fix the `/images` dev proxy (#4) — primary feature is visually broken in dev
- Create Alembic migrations for the new indexes (#2) — without this, the DB schema change is invisible

**For a "production-ready" mark:**
- httpOnly cookie for JWT (#1)
- CORS + security headers (#8, #9)
- ARIA labels on quiz and images (#16, #17)

---

*End of Phase 0 Audit. Awaiting "Proceed to Phase 1" before any code changes.*
