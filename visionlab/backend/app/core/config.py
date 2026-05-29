from __future__ import annotations

from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = BASE_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    APP_VERSION: str = "1.0.0"
    APP_ENV: str = "development"
    SECRET_KEY: str = "insecure-dev-secret-change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    DATABASE_URL: str = (
        "postgresql+asyncpg://visionlab:visionlab@localhost:5432/visionlab"
    )
    SYNC_DATABASE_URL: str = (
        "postgresql://visionlab:visionlab@localhost:5432/visionlab"
    )
    DB_ECHO: bool = False  # default OFF; was previously echoing every SQL query
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20

    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GEMINI_FALLBACK_MODEL: str = "gemini-2.0-flash"
    GEMINI_TIMEOUT_S: int = 12

    AUDIO_OUTPUT_DIR: str = "audio_outputs"

    CORS_ORIGINS: str = (
        "http://localhost:5173,http://localhost:3000,http://localhost"
    )

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def audio_dir(self) -> Path:
        path = BASE_DIR / self.AUDIO_OUTPUT_DIR
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def image_dir(self) -> Path:
        path = BASE_DIR / "image_outputs"
        path.mkdir(parents=True, exist_ok=True)
        return path


settings = Settings()
