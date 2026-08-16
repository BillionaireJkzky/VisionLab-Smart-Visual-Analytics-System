# VisionLab Backend

## Two ways to run this, and why they must never share state

1. **Docker Compose** (`docker compose up` from the repo root) — the primary way to run
   this project. `docker-compose.yml` hardcodes its own `DATABASE_URL`, `REDIS_URL`,
   `CELERY_BROKER_URL`, and `CELERY_RESULT_BACKEND` as container environment variables.
   It does **not** read this directory's `.env` file at all — those container env vars
   always take precedence over anything baked into the image.

2. **Native** (a bare `uvicorn`/`celery` process run directly on the host, from this
   `backend/` directory) — reads `backend/.env` via `app/core/config.py`. Useful for
   quick debugging with a debugger attached, but not the normal way to run the app.

### Why isolation matters

Both the Docker Postgres and Redis are exposed to the host (`localhost:5432` /
`localhost:6379`), so a native process can trivially reach them. If a native Celery
worker's `.env` pointed at the **same** Redis DB and Postgres database Docker uses, it
would silently compete with the Docker `worker` for tasks from the same queue — and
since Celery workers race for tasks, roughly half of them (whichever the native worker
won) would be processed by a process whose `image_outputs`/`audio_outputs` directories
are **not** the ones the Docker `api` container serves from (`BASE_DIR` resolves
relative to wherever the process actually runs — `/app` in the container vs. this literal
folder on the host). The task's DB row still gets written correctly (same Postgres), so
the frontend would show a plausible "completed" result with a 404 image or audio file.
This happened twice before this isolation was put in place.

**The fix**: `backend/.env` / `backend/.env.example` deliberately point the native stack
at a *different* database and Redis DB indices than Docker:

| | Docker (docker-compose.yml, hardcoded) | Native (`backend/.env`) |
|---|---|---|
| Postgres database | `visionlab` | `visionlab_native` |
| Redis broker | db `0` | db `2` |
| Redis result backend | db `1` | db `3` |

Both databases live in the same Postgres server (there's only one, Docker's) — they're
just different logical databases, so a native run's data can never be mixed up with
Docker's. If you ever regenerate `backend/.env` from `.env.example`, or edit it by hand,
**keep it pointed at `visionlab_native` and Redis db 2/3** — never db 0/1 or the
`visionlab` database. If a native Celery worker is running and you don't specifically
need it, stop it (`Stop-Process` / `kill` on the `celery` process) — Docker's `worker`
service already handles task processing for the normal `docker compose up` workflow.

### First-time native setup

`visionlab_native` doesn't exist until you create it once:

```sql
-- via `docker compose exec postgres psql -U visionlab -d visionlab`
CREATE DATABASE visionlab_native OWNER visionlab;
```

Then, from `backend/` with the native venv active:

```bash
alembic upgrade head
```

(If you're bootstrapping a genuinely empty database and `alembic upgrade head` fails
with an "already exists"-style error partway through, it means the migration chain
assumes some base schema that predates it — create the schema directly from the models
instead, then stamp: `python -c "..."` calling `Base.metadata.create_all()`, then
`alembic stamp head`. Not needed for `visionlab_native` — that's already done.)
