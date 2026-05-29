FROM python:3.11-bookworm


WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get update -o Acquire::Retries=10 -o Acquire::http::Timeout=60 && \
    apt-get install -y --fix-missing --no-install-recommends \
        ffmpeg \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libgomp1 || apt-get -f install -y && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p audio_outputs

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]