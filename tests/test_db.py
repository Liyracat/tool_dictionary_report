from pathlib import Path

from app.db import Database, ensure_schema, row_to_dict


def test_initialize_creates_database(tmp_path: Path) -> None:
    db_path = tmp_path / "example.sqlite"
    schema_path = Path(__file__).resolve().parent.parent / "schema.sql"
    db = Database(db_path)

    created = ensure_schema(db, schema_path)

    assert created is True
    assert db_path.exists()

    # verifying a table exists
    with db.connect() as conn:
        tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    assert {row_to_dict(t)["name"] for t in tables} >= {"chunks", "items"}


def test_transaction_context_manager(tmp_path: Path) -> None:
    db_path = tmp_path / "transaction.sqlite"
    schema_path = Path(__file__).resolve().parent.parent / "schema.sql"
    db = Database(db_path)
    ensure_schema(db, schema_path)

    with db.transaction() as cur:
        cur.execute(
            "INSERT INTO chunks(chunk_id, thread_id, digest, locator_json) VALUES (?,?,?,?)",
            ("chunk-1", "thread", "digest", "{}"),
        )

    with db.connect() as conn:
        saved = conn.execute("SELECT * FROM chunks WHERE chunk_id='chunk-1'").fetchone()
    assert saved is not None


def test_row_to_dict(tmp_path: Path) -> None:
    db_path = tmp_path / "row.sqlite"
    schema_path = Path(__file__).resolve().parent.parent / "schema.sql"
    db = Database(db_path)
    ensure_schema(db, schema_path)

    with db.transaction() as cur:
        cur.execute(
            "INSERT INTO chunks(chunk_id, thread_id, digest, locator_json) VALUES (?,?,?,?)",
            ("chunk-2", "thread", "digest", "{}"),
        )

    with db.connect() as conn:
        row = conn.execute("SELECT * FROM chunks WHERE chunk_id='chunk-2'").fetchone()

    assert row_to_dict(row) == {
        "chunk_id": "chunk-2",
        "thread_id": "thread",
        "source_type": "chatgpt_export_json",
        "time_start": None,
        "time_end": None,
        "digest": "digest",
        "locator_json": "{}",
        "hint": None,
        "created_at": row["created_at"],
    }