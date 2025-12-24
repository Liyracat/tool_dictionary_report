from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterable, Optional


APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent


class Database:
    """Simple SQLite helper used across the application."""

    def __init__(self, db_path: os.PathLike[str] | str = "db.sqlite") -> None:
        self.db_path = Path(db_path)

    def initialize(self, schema_path: os.PathLike[str] | str) -> bool:
        """
        Initialize the database from the given schema file if it does not exist.

        Returns True if a new database was created, False if it already existed.
        """

        if self.db_path.exists():
            return False

        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.apply_schema(schema_path)
        return True

    def apply_schema(self, schema_path: os.PathLike[str] | str) -> None:
        schema_sql = Path(schema_path).read_text(encoding="utf-8")
        with self.connect() as conn:
            conn.executescript(schema_sql)

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        return conn

    @contextmanager
    def transaction(self) -> Iterable[sqlite3.Cursor]:
        conn = self.connect()
        cursor = conn.cursor()
        try:
            yield cursor
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def health_check(self) -> None:
        with self.connect() as conn:
            conn.execute("SELECT 1;")


def row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {key: row[key] for key in row.keys()}


def default_schema_path() -> Path:
    """Return a schema path that works regardless of the working directory.

    Preference order:
    1. `SCHEMA_PATH` environment variable when provided.
    2. Project root `schema.sql`.
    3. A fallback next to the backend package for local overrides.
    """

    if schema_env := os.environ.get("SCHEMA_PATH"):
        return Path(schema_env)

    candidates = [PROJECT_ROOT / "schema.sql", BACKEND_DIR / "schema.sql"]
    for candidate in candidates:
        if candidate.exists():
            return candidate

    # Even if the file is missing, return the expected default path for clearer errors.
    return candidates[0]


def ensure_schema(db: Database, schema_path: Optional[os.PathLike[str] | str] = None) -> bool:
    """Create the database from the schema if it is not present."""
    schema = schema_path or default_schema_path()
    created = db.initialize(schema)
    if not created:
        db.apply_schema(schema)
    return created