from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from .db import Database, row_to_dict


class ItemsRepo:
    def __init__(self, db: Database) -> None:
        self.db = db

    def create_chunk(self, *, chunk_id: str, thread_id: str, digest: str, locator_json: str,
                     source_type: str = "chatgpt_export_json", time_start: Optional[str] = None,
                     time_end: Optional[str] = None, hint: Optional[str] = None) -> None:
        with self.db.transaction() as cur:
            cur.execute(
                """
                INSERT INTO chunks(chunk_id, thread_id, source_type, time_start, time_end, digest, locator_json, hint)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (chunk_id, thread_id, source_type, time_start, time_end, digest, locator_json, hint),
            )

    def create_item(
        self,
        *,
        item_id: str,
        chunk_id: str,
        kind: str,
        schema_id: str,
        title: str,
        body: str,
        stable_key: Optional[str] = None,
        domain: Optional[str] = None,
        confidence: float = 0.0,
        status: str = "active",
        evidence_basis: Optional[str] = None,
    ) -> None:
        with self.db.transaction() as cur:
            cur.execute(
                """
                INSERT INTO items(item_id, chunk_id, kind, schema_id, stable_key, title, body, domain, confidence, status, evidence_basis)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item_id,
                    chunk_id,
                    kind,
                    schema_id,
                    stable_key,
                    title,
                    body,
                    domain,
                    confidence,
                    status,
                    evidence_basis,
                ),
            )

    def add_payload(self, item_id: str, payload: Dict[str, Any]) -> None:
        with self.db.transaction() as cur:
            cur.execute(
                """
                INSERT OR REPLACE INTO item_payloads(item_id, payload_json)
                VALUES (?, ?)
                """,
                (item_id, json.dumps(payload)),
            )

    def get_item(self, item_id: str) -> Optional[Dict[str, Any]]:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM items WHERE item_id = ?", (item_id,)).fetchone()
            return row_to_dict(row) if row else None

    def list_items(self) -> List[Dict[str, Any]]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM items ORDER BY created_at DESC").fetchall()
            return [row_to_dict(r) for r in rows]


class TagsRepo:
    def __init__(self, db: Database) -> None:
        self.db = db

    def create_tag(self, name: str, path: Optional[str] = None, parent_id: Optional[int] = None) -> int:
        with self.db.transaction() as cur:
            cur.execute(
                """
                INSERT INTO tags(name, path, parent_id)
                VALUES (?, ?, ?)
                """,
                (name, path, parent_id),
            )
            return cur.lastrowid

    def add_tag_to_item(self, item_id: str, tag_id: int, confidence: float = 0.0) -> None:
        with self.db.transaction() as cur:
            cur.execute(
                """
                INSERT OR REPLACE INTO item_tags(item_id, tag_id, confidence)
                VALUES (?, ?, ?)
                """,
                (item_id, tag_id, confidence),
            )

    def list_tags(self) -> List[Dict[str, Any]]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM tags ORDER BY tag_id").fetchall()
            return [row_to_dict(r) for r in rows]


class LinksRepo:
    def __init__(self, db: Database) -> None:
        self.db = db

    def create_link(
        self,
        *,
        link_id: str,
        item_id: str,
        rel: str,
        target_key: str,
        note: Optional[str] = None,
        confidence: float = 0.0,
    ) -> None:
        with self.db.transaction() as cur:
            cur.execute(
                """
                INSERT INTO item_links(link_id, item_id, rel, target_key, note, confidence)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (link_id, item_id, rel, target_key, note, confidence),
            )

    def list_links_for_item(self, item_id: str) -> List[Dict[str, Any]]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM item_links WHERE item_id = ?", (item_id,)).fetchall()
            return [row_to_dict(r) for r in rows]


class SearchRepo:
    def __init__(self, db: Database) -> None:
        self.db = db

    def search_items(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        with self.db.connect() as conn:
            rows = conn.execute(
                """
                SELECT i.*
                FROM items_fts
                JOIN items i ON i.item_id = items_fts.item_id
                WHERE items_fts MATCH ?
                ORDER BY bm25(items_fts)
                LIMIT ?
                """,
                (query, limit),
            ).fetchall()
            return [row_to_dict(r) for r in rows]

    def list_by_kind(self, kind: str) -> List[Dict[str, Any]]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM items WHERE kind = ?", (kind,)).fetchall()
            return [row_to_dict(r) for r in rows]


class ImportRepo:
    def __init__(self, db: Database) -> None:
        self.db = db

    def create_job(
        self,
        *,
        job_id: str,
        source_json: Dict[str, Any],
        source_type: str = "chatgpt_export_json",
        thread_id: Optional[str] = None,
        chunk_id: Optional[str] = None,
        digest: Optional[str] = None,
        hint: Optional[str] = None,
    ) -> None:
        with self.db.transaction() as cur:
            cur.execute(
                """
                INSERT INTO import_jobs(job_id, source_type, thread_id, chunk_id, digest, hint, source_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (job_id, source_type, thread_id, chunk_id, digest, hint, json.dumps(source_json)),
            )

    def add_candidate(
        self,
        *,
        candidate_id: str,
        job_id: str,
        temp_item_id: str,
        item_json: Dict[str, Any],
        decision: str = "KEEP",
        skip_type: str = "NONE",
        reason: Optional[str] = None,
    ) -> None:
        with self.db.transaction() as cur:
            cur.execute(
                """
                INSERT INTO import_candidates(candidate_id, job_id, temp_item_id, decision, skip_type, reason, item_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    candidate_id,
                    job_id,
                    temp_item_id,
                    decision,
                    skip_type,
                    reason,
                    json.dumps(item_json),
                ),
            )

    def map_temp_id(self, job_id: str, temp_item_id: str, item_id: str) -> None:
        with self.db.transaction() as cur:
            cur.execute(
                """
                INSERT OR REPLACE INTO import_id_map(job_id, temp_item_id, item_id)
                VALUES (?, ?, ?)
                """,
                (job_id, temp_item_id, item_id),
            )

    def list_candidates(self, job_id: str) -> List[Dict[str, Any]]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM import_candidates WHERE job_id = ?", (job_id,)).fetchall()
            return [row_to_dict(r) for r in rows]

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM import_jobs WHERE job_id = ?", (job_id,)).fetchone()
            return row_to_dict(row) if row else None


__all__ = [
    "ItemsRepo",
    "TagsRepo",
    "LinksRepo",
    "SearchRepo",
    "ImportRepo",
]