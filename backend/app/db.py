from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterable, Optional


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

        schema_sql = Path(schema_path).read_text(encoding="utf-8")
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.executescript(schema_sql)
        return True

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
    here = Path(__file__).resolve().parent.parent
    return here / "schema.sql"


def ensure_schema(db: Database, schema_path: Optional[os.PathLike[str] | str] = None) -> bool:
    return db.initialize(schema_path or default_schema_path())