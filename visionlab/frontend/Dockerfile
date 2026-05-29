# ── Stage 1: builder — installs deps, downloads YOLO weights once. ──────────
FROM python:3.11-bookworm AS builder

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System libraries needed by OpenCV, Pillow, ffmpeg, etc.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libgomp1 \
        && rm -rf /var/lib/apt/lists/*

# Install Python deps first so Docker can cache this layer when only code changes.
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt

# ── Stage 2: runtime image. ──────────────────────────────────────────────────
FROM python:3.11-bookworm

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/app/models \
    TRANSFORMERS_OFFLINE=0 \
    YOLO_CONFIG_DIR=/app/.yolo_cache \
    OMP_NUM_THREADS=2 \
    MKL_NUM_THREADS=2 \
    TOKENIZERS_PARALLELISM=false

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libgomp1 \
        && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from the builder.
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy the application code (and pre-downloaded YOLO weights if present).
COPY . .

# Make sure the runtime output directories exist.
RUN mkdir -p audio_outputs image_outputs models .yolo_cache

EXPOSE 8000

# Default command runs the API. The Celery worker uses a different command
# in docker-compose (see docker-compose.yml).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
