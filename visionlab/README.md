# VisionLab – Smart Visual Analytics System

> **AI-Powered Accessibility and Visual Learning for Children with Autism and English Language Learners**
>
> University of Wolverhampton · Module 6CS007/FM2: Project and Professionalism
> Student: Si Thu Aung (2631597) · Supervisor: Dr Aye Aye

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Project Structure](#project-structure)
5. [Getting Started](#getting-started)
   - [Prerequisites](#prerequisites)
   - [Docker Deployment (Recommended)](#docker-deployment-recommended)
   - [Local Development](#local-development)
6. [API Reference](#api-reference)
7. [AI Pipeline](#ai-pipeline)
8. [Accessibility Features](#accessibility-features)
9. [SM-2 Adaptive Quiz Engine](#sm-2-adaptive-quiz-engine)
10. [Testing](#testing)
11. [Environment Variables](#environment-variables)

---

## Overview

VisionLab is a distributed, asynchronous, multi-model AI web application that delivers real-time image intelligence in an accessible format. The system accepts image uploads and produces:

- **Object detection** with bounding boxes, confidence scores, and location descriptors (YOLOv8)
- **Facial emotion recognition** with child-friendly labels and Social Story descriptions (DeepFace)
- **Multilingual text extraction** with English translation (EasyOCR + deep-translator)
- **Scene classification** using Vision Transformers (HuggingFace ViT)
- **AI-generated stories** in three modes: Fun Adventure, Social Story (ASD), Educational (ELL) — via Gemini
- **Text-to-speech audio narration** synthesised directly from the generated story text (gTTS)
- **Adaptive vocabulary quiz** with SM-2 spaced repetition scheduling
- **Annotated result image** with detection boxes drawn in a stable per-label colour palette

Each pipeline run streams **per-step progress** (`waiting` → `running` → `done`/`failed`/`skipped`) so the frontend can show live status while the worker processes an upload.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                           │
│          (Vite + TypeScript + TailwindCSS + React Router)       │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP / REST
┌───────────────────────────▼─────────────────────────────────────┐
│                    FastAPI (ASGI / Uvicorn)                      │
│  JWT Auth · Request-ID + Rate-Limit Middleware · Image Upload   │
│           · Task Polling · Vocabulary API · Admin API           │
└───────────────────────────┬─────────────────────────────────────┘
                            │ Celery task
┌───────────────────────────▼─────────────────────────────────────┐
│              Celery Worker (Redis broker)                        │
│                                                                 │
│  YOLOv8 → DeepFace → EasyOCR → ViT → Gemini Story → gTTS → SM-2│
│                     (progress tracked per step)                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │ SQLAlchemy (async)
┌───────────────────────────▼─────────────────────────────────────┐
│                      PostgreSQL 16                               │
│         users · analysis_tasks · user_vocabulary · quiz_attempts│
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| **API Framework** | FastAPI 0.111 + Uvicorn (ASGI) |
| **Task Queue** | Celery 5.4 + Redis 7 |
| **Database** | PostgreSQL 16 + SQLAlchemy 2 (async) + Alembic |
| **Auth** | JWT (python-jose) + bcrypt (passlib) |
| **HTTP Middleware** | Request-ID tagging + Redis-backed rate limiting (fail-open) |
| **Object Detection** | YOLOv8n (Ultralytics) |
| **Emotion Recognition** | DeepFace |
| **OCR** | EasyOCR + deep-translator |
| **Scene Classification** | ViT (google/vit-base-patch16-224, HuggingFace) |
| **Story Generation** | Google Gemini (google-generativeai), with automatic fallback model |
| **Text-to-Speech** | gTTS, narrating directly from the generated story text |
| **Adaptive Quiz** | SM-2 algorithm (custom implementation) |
| **Frontend** | React 18 + TypeScript + TailwindCSS + Vite |
| **Containerisation** | Docker + Docker Compose |
| **Task Monitoring** | Celery Flower |

---

## Project Structure

```
visionlab/
├── backend/
│   ├── app/
│   │   ├── api/               # FastAPI routers
│   │   │   ├── auth.py        # Registration, login, /me
│   │   │   ├── analysis.py    # Image upload, task polling, results
│   │   │   ├── vocabulary.py  # SM-2 quiz, progress, review
│   │   │   └── admin.py       # Admin analytics
│   │   ├── core/
│   │   │   ├── config.py      # Pydantic settings
│   │   │   ├── database.py    # Async SQLAlchemy engine
│   │   │   ├── security.py    # JWT + bcrypt
│   │   │   ├── middleware.py  # Request-ID + Redis rate limiting
│   │   │   └── deps.py        # FastAPI dependencies
│   │   ├── models/
│   │   │   └── models.py      # ORM: User, AnalysisTask, VocabularyItem, QuizAttempt
│   │   ├── schemas/
│   │   │   └── schemas.py     # Pydantic v2 request/response schemas
│   │   ├── services/
│   │   │   ├── detection.py   # YOLOv8 object detection
│   │   │   ├── emotion.py     # DeepFace emotion recognition
│   │   │   ├── ocr.py         # EasyOCR + translation
│   │   │   ├── scene.py       # ViT scene classification
│   │   │   ├── story.py       # Gemini story generation
│   │   │   ├── tts.py         # gTTS audio synthesis from story text
│   │   │   ├── annotate.py    # Draws detection boxes onto the result image
│   │   │   └── quiz.py        # SM-2 quiz engine
│   │   ├── tasks/
│   │   │   ├── celery_app.py  # Celery factory
│   │   │   ├── steps.py       # Per-step pipeline execution + progress tracking
│   │   │   └── pipeline.py    # Main AI pipeline task
│   │   └── main.py            # FastAPI application
│   ├── alembic/               # Database migrations
│   ├── tests/                 # Pytest unit tests
│   ├── requirements.txt
│   ├── Dockerfile
│   └── alembic.ini
├── frontend/
│   ├── src/
│   │   ├── components/        # Layout, shared UI
│   │   ├── pages/             # Dashboard, Analysis, Result, Progress, History, Admin, Login, Register
│   │   ├── hooks/              # useAuth, useHighContrast
│   │   ├── services/          # Axios API client
│   │   ├── types/             # TypeScript interfaces
│   │   └── styles/             # TailwindCSS + accessibility CSS
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── docs/
│   └── AUDIT.md
├── docker-compose.yml
└── README.md
```

---

## Getting Started

### Prerequisites

- Docker 24+ and Docker Compose v2
- A Gemini API key for story generation

### Docker Deployment (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/your-username/visionlab.git
cd visionlab

# 2. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env and set GEMINI_API_KEY

# 3. Start all services
docker compose up --build -d

# 4. Run database migrations
docker compose exec api alembic upgrade head

# 5. Create an admin user (optional)
docker compose exec api python -c "
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.models.models import User
from app.core.security import hash_password
from app.core.config import settings

engine = create_engine(settings.SYNC_DATABASE_URL)
with Session(engine) as s:
    u = User(username='admin', email='admin@visionlab.local',
             hashed_password=hash_password('adminpass123'), role='admin')
    s.add(u); s.commit()
print('Admin user created.')
"
```

**Service URLs:**

| Service | URL |
|---|---|
| Frontend | http://localhost |
| API (Swagger) | http://localhost:8000/docs |
| Celery Flower | http://localhost:5555 |

### Local Development

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # configure DATABASE_URL, REDIS_URL, GEMINI_API_KEY

# Start PostgreSQL and Redis (via Docker)
docker run -d -p 5432:5432 -e POSTGRES_USER=visionlab -e POSTGRES_PASSWORD=visionlab -e POSTGRES_DB=visionlab postgres:16-alpine
docker run -d -p 6379:6379 redis:7-alpine

# Run migrations
alembic upgrade head

# Start API server
uvicorn app.main:app --reload --port 8000

# Start Celery worker (separate terminal)
celery -A app.tasks.celery_app worker --loglevel=info

# Frontend
cd ../frontend
npm ci
npm run dev
```

---

## API Reference

All endpoints are prefixed with `/api/v1`. Full interactive documentation is available at `/docs`.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register` | Register a new user |
| `POST` | `/auth/login` | Obtain JWT access token |
| `GET` | `/auth/me` | Get current user profile |

### Image Analysis

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/analysis/upload` | Upload image and enqueue AI pipeline |
| `GET` | `/analysis/tasks/{task_id}` | Poll task status and per-step progress |
| `GET` | `/analysis/result/{task_id}` | Retrieve full analysis result |
| `GET` | `/analysis/history` | List user's past analyses |

### Vocabulary & Quiz

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/vocabulary/progress/{user_id}` | SM-2 learning progress |
| `GET` | `/vocabulary/review/{user_id}` | Words due for review today |
| `POST` | `/vocabulary/quiz/submit` | Submit quiz answer (triggers SM-2 update) |

### Admin

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/admin/analytics` | System-wide usage statistics |
| `GET` | `/admin/users` | List all registered users |

`/auth/login` and `/auth/register` are additionally rate-limited (10 and 5 requests/minute respectively) via the Redis-backed rate-limit middleware; `/analysis/upload` is capped at 30 requests/minute per client.

---

## AI Pipeline

The Celery worker executes the following steps for each uploaded image, tracking `waiting` / `running` / `done` / `failed` / `skipped` status per step for live progress polling:

1. **YOLOv8 Object Detection** — Detects objects with labels, confidence scores, bounding boxes, and relative location descriptors (top-left, centre, bottom-right, etc.), then draws the boxes onto an annotated copy of the image using a stable per-label colour palette.

2. **DeepFace Emotion Recognition** — Analyses each detected face and outputs the dominant emotion with a child-friendly label and description in one of three modes: `standard`, `simple`, or `social_story` (Carol Gray format).

3. **EasyOCR Text Extraction** — Extracts text from the image supporting 80+ languages, then translates to English using Google Translate via deep-translator.

4. **ViT Scene Classification** — Classifies the overall scene using `google/vit-base-patch16-224` from HuggingFace Transformers.

5. **Gemini Story Generation** — Constructs a structured prompt from all prior results and calls Gemini (with an automatic fallback model on failure/timeout) to generate three story variants: Fun Adventure, Social Story, and Educational.

6. **gTTS Audio Synthesis** — Cleans the generated story text (stripping markdown and, for the Educational mode, the vocabulary list) and synthesises an MP3 narration directly from it, returning a media URL.

7. **SM-2 Quiz Generation** — Generates 3 vocabulary questions (multiple choice, fill-in-the-blank, true/false) from detected object labels at the user's chosen difficulty level.

8. **Persistence** — All results are stored in PostgreSQL; detected vocabulary words are upserted into the user's vocabulary table.

---

## Accessibility Features

VisionLab is designed with an accessibility-first approach:

- **Calm, uncluttered layout** with generous whitespace and soft colour palette
- **High-contrast mode** toggle (keyboard accessible, persisted to localStorage)
- **Skip-to-content link** for keyboard navigation
- **ARIA labels** on all interactive elements and images
- **Focus ring** visible on all focusable elements
- **Audio narration** with accessible `<audio>` player for all visual content
- **Text equivalents** for all emotion labels and scene descriptions
- **Child-friendly language** throughout — short sentences, positive framing
- **Social Story mode** conforming to Carol Gray Social Story authorship guidelines

---

## SM-2 Adaptive Quiz Engine

The vocabulary quiz uses the **SM-2 spaced repetition algorithm** (Wozniak, 1990):

```
New EF = EF + (0.1 − (5 − q) × (0.08 + (5 − q) × 0.02))
```

Where `q` is the quality score (0–5). The interval schedule is:

| Repetition | Interval |
|---|---|
| 1st correct | 1 day |
| 2nd correct | 6 days |
| 3rd+ correct | Previous interval × EF |
| Incorrect | Reset to 1 day |

Each quiz submission updates the `user_vocabulary` table and schedules the next review date accordingly.

---

## Testing

```bash
cd backend
pytest tests/ -v
```

The test suite covers:
- SM-2 algorithm correctness (interval progression, EF floor, reset on failure)
- Quiz question generation (structure, difficulty levels, unknown label fallback)
- Object detection service (location descriptor logic, return type validation)

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `SECRET_KEY` | JWT signing secret | (required) |
| `DATABASE_URL` | Async PostgreSQL URL | `postgresql+asyncpg://...` |
| `SYNC_DATABASE_URL` | Sync PostgreSQL URL (Celery) | `postgresql://...` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379/0` |
| `CELERY_BROKER_URL` | Celery broker URL | `redis://localhost:6379/0` |
| `CELERY_RESULT_BACKEND` | Celery result backend | `redis://localhost:6379/1` |
| `GEMINI_API_KEY` | Gemini API key | (required for stories) |
| `GEMINI_MODEL` | Primary Gemini model name | `gemini-2.5-flash` |
| `GEMINI_FALLBACK_MODEL` | Fallback Gemini model name | `gemini-2.0-flash` |
| `GEMINI_TIMEOUT_S` | Gemini request timeout (seconds) | `12` |
| `CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:5173,http://localhost:3000,http://localhost` |

---

## References

- Jocher, G., Chaurasia, A. and Qiu, J. (2023) *Ultralytics YOLOv8*. Available at: https://github.com/ultralytics/ultralytics
- Serengil, S.I. and Ozpinar, A. (2021) 'HyperExtended LightFace', *ICEET*.
- Wolf, T. et al. (2020) 'Transformers: State-of-the-Art NLP', *EMNLP*.
- Wozniak, P. (1990) 'Optimization of Learning', *SuperMemo*.
- Gray, C. (1994) *The New Social Story Book*. Future Horizons.
