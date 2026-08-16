"""
Reset accumulated dev/test data so History is empty and benchmark runs start
from a clean state. Wipes ROWS only — schema and Alembic migrations are
never touched.

Usage:
    # Dry run (default) — just prints the summary, deletes nothing.
    python -m app.scripts.reset_test_data

    # Wipe everything: all users, all tasks, all media, all cached results.
    python -m app.scripts.reset_test_data --all --execute

    # Keep one real account (and its data), wipe everything else.
    python -m app.scripts.reset_test_data --keep-user me@example.com --execute

    # Skip the active-task guard (only if you're sure no job is running).
    python -m app.scripts.reset_test_data --all --execute --force

    # Skip the interactive "type yes" prompt (e.g. for CI/cron use).
    python -m app.scripts.reset_test_data --all --execute --yes
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

import redis
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from app.core.config import settings

# Tables holding run-time/test data. alembic_version is deliberately excluded.
DATA_TABLES = ["quiz_attempts", "user_vocabulary", "analysis_tasks", "users"]

MEDIA_DIRS = {
    "images": settings.image_dir,
    "audio": settings.audio_dir,
}

_LOCAL_HOSTS = {"localhost", "127.0.0.1", "postgres", "db", "0.0.0.0"}
_CLOUD_HOST_HINTS = ("amazonaws.com", "rds.", "azure.com", ".gcp", "supabase.co", "neon.tech")


def _abort(msg: str) -> None:
    print(f"[ABORT] {msg}", file=sys.stderr)
    sys.exit(1)


def _guard_not_production() -> None:
    """Refuse to run against anything that isn't clearly local/dev."""
    if settings.APP_ENV.lower() == "production":
        _abort("APP_ENV=production - refusing to run against a production environment.")

    host = urlparse(settings.SYNC_DATABASE_URL).hostname or ""
    if host not in _LOCAL_HOSTS:
        _abort(
            f"DATABASE_URL host '{host}' is not in the local/dev allowlist {sorted(_LOCAL_HOSTS)}. "
            "Refusing to run - this looks like it could be a shared or production database."
        )
    if any(hint in host for hint in _CLOUD_HOST_HINTS):
        _abort(f"DATABASE_URL host '{host}' looks like a managed cloud database. Refusing to run.")


@dataclass
class Summary:
    row_counts: dict[str, int] = field(default_factory=dict)
    file_counts: dict[str, int] = field(default_factory=dict)
    file_bytes: dict[str, int] = field(default_factory=dict)
    result_backend_keys: int = 0
    active_tasks: int = 0


def _discover(engine: Engine) -> Summary:
    summary = Summary()
    with engine.connect() as conn:
        for table in DATA_TABLES:
            count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar_one()
            summary.row_counts[table] = count
        summary.active_tasks = conn.execute(
            text("SELECT COUNT(*) FROM analysis_tasks WHERE status IN ('pending', 'processing')")
        ).scalar_one()

    for label, dir_path in MEDIA_DIRS.items():
        files = [f for f in Path(dir_path).iterdir() if f.is_file() and f.name != ".gitkeep"]
        summary.file_counts[label] = len(files)
        summary.file_bytes[label] = sum(f.stat().st_size for f in files)

    client = redis.from_url(settings.CELERY_RESULT_BACKEND)
    summary.result_backend_keys = len(client.keys("celery-task-meta-*"))
    client.close()

    return summary


def _print_summary(summary: Summary) -> None:
    print("\n=== Current data ===")
    for table, count in summary.row_counts.items():
        print(f"  {table:<20} {count} rows")
    for label in MEDIA_DIRS:
        mb = summary.file_bytes[label] / (1024 * 1024)
        print(f"  {label + '_outputs/':<20} {summary.file_counts[label]} files, {mb:.1f} MB")
    print(f"  {'redis result backend':<20} {summary.result_backend_keys} keys")
    if summary.active_tasks:
        print(f"\n  WARNING: {summary.active_tasks} task(s) currently pending/processing.")
    print()


def _clear_media(keep_filenames: set[str]) -> dict[str, int]:
    removed: dict[str, int] = {}
    for label, dir_path in MEDIA_DIRS.items():
        count = 0
        for f in Path(dir_path).iterdir():
            if not f.is_file() or f.name == ".gitkeep" or f.name in keep_filenames:
                continue
            f.unlink()
            count += 1
        removed[label] = count
    return removed


def _kept_filenames(engine: Engine, keep_user_id) -> set[str]:
    """Basenames of media files belonging to the user we're keeping."""
    if keep_user_id is None:
        return set()
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT annotated_image_url, audio_url FROM analysis_tasks WHERE user_id = :id"
            ),
            {"id": keep_user_id},
        ).all()
    names: set[str] = set()
    for annotated_image_url, audio_url in rows:
        for url in (annotated_image_url, audio_url):
            if url:
                names.add(Path(url).name)
    return names


def _wipe_all(engine: Engine) -> None:
    with engine.begin() as conn:
        tables = ", ".join(DATA_TABLES)
        conn.execute(text(f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE"))


def _wipe_keep_user(engine: Engine, email: str):
    with engine.begin() as conn:
        row = conn.execute(text("SELECT id FROM users WHERE email = :email"), {"email": email}).fetchone()
        if row is None:
            _abort(f"No user found with email '{email}'. Nothing was deleted.")
        keep_id = row[0]
        conn.execute(text("DELETE FROM quiz_attempts WHERE user_id != :id"), {"id": keep_id})
        conn.execute(text("DELETE FROM user_vocabulary WHERE user_id != :id"), {"id": keep_id})
        conn.execute(text("DELETE FROM analysis_tasks WHERE user_id != :id"), {"id": keep_id})
        conn.execute(text("DELETE FROM users WHERE id != :id"), {"id": keep_id})
    return keep_id


def _clear_result_backend() -> int:
    client = redis.from_url(settings.CELERY_RESULT_BACKEND)
    keys = client.keys("celery-task-meta-*")
    if keys:
        client.delete(*keys)
    client.close()
    return len(keys)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--execute", action="store_true", help="Actually delete data (default: dry-run summary only)")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--keep-user", metavar="EMAIL", help="Preserve this account and its data; wipe everything else")
    mode.add_argument("--all", action="store_true", help="Full wipe, including all users")
    parser.add_argument("--force", action="store_true", help="Skip the active-task guard")
    parser.add_argument("--yes", action="store_true", help="Skip the interactive 'type yes' confirmation")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    _guard_not_production()

    sync_url = settings.SYNC_DATABASE_URL
    engine = create_engine(sync_url)

    summary = _discover(engine)
    _print_summary(summary)

    if not args.execute:
        print("Dry run only - nothing was deleted.")
        print("Re-run with --execute --all  OR  --execute --keep-user <email> to proceed.\n")
        return

    if not args.keep_user and not args.all:
        _abort("--execute requires either --all or --keep-user <email>.")

    if summary.active_tasks and not args.force:
        _abort(
            f"{summary.active_tasks} task(s) are pending/processing. "
            "Wait for them to finish, or pass --force to proceed anyway."
        )

    mode_desc = "ALL users and data" if args.all else f"everything except user '{args.keep_user}'"
    print(f"About to permanently delete {mode_desc}. This cannot be undone.")
    if not args.yes:
        confirm = input("Type 'yes' to continue: ").strip().lower()
        if confirm != "yes":
            print("Aborted - nothing was deleted.")
            return

    keep_id = None
    if args.all:
        _wipe_all(engine)
    else:
        keep_id = _wipe_keep_user(engine, args.keep_user)

    keep_filenames = _kept_filenames(engine, keep_id) if keep_id else set()
    removed_files = _clear_media(keep_filenames)
    removed_keys = _clear_result_backend()

    print("\n=== Deleted ===")
    for table, count in summary.row_counts.items():
        print(f"  {table:<20} {count} rows")
    for label, count in removed_files.items():
        print(f"  {label + '_outputs/':<20} {count} files removed")
    print(f"  {'redis result backend':<20} {removed_keys} keys cleared")
    print("\nDone. Schema and Alembic migrations were not touched.\n")


if __name__ == "__main__":
    main()
