from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Sequence

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

    def update_item(
        self,
        *,
        item_id: str,
        kind: str,
        schema_id: str,
        title: str,
        body: str,
        stable_key: Optional[str] = None,
        domain: Optional[str] = None,
        confidence: float = 0.0,
        status: str = "active",
        evidence_basis: Optional[str] = None,
        chunk_id: Optional[str] = None,
    ) -> None:
        with self.db.transaction() as cur:
            cur.execute(
                """
                UPDATE items
                SET kind = ?, schema_id = ?, title = ?, body = ?, stable_key = ?, domain = ?,
                    confidence = ?, status = ?, evidence_basis = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                    chunk_id = COALESCE(?, chunk_id)
                WHERE item_id = ?
                """,
                (
                    kind,
                    schema_id,
                    title,
                    body,
                    stable_key,
                    domain,
                    confidence,
                    status,
                    evidence_basis,
                    chunk_id,
                    item_id,
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

    def get_payload(self, item_id: str) -> Dict[str, Any]:
        with self.db.connect() as conn:
            row = conn.execute(
                "SELECT payload_json FROM item_payloads WHERE item_id = ?", (item_id,)
            ).fetchone()
            return json.loads(row["payload_json"]) if row else {}

    def get_item(self, item_id: str) -> Optional[Dict[str, Any]]:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM items WHERE item_id = ?", (item_id,)).fetchone()
            return row_to_dict(row) if row else None

    def list_items(self) -> List[Dict[str, Any]]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM items ORDER BY created_at DESC").fetchall()
            return [row_to_dict(r) for r in rows]

    def soft_delete(self, item_id: str) -> None:
        with self.db.transaction() as cur:
            cur.execute(
                """
                UPDATE items SET status = 'deleted', updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
                WHERE item_id = ?
                """,
                (item_id,),
            )

    def ensure_chunk_for_item(self, chunk_id: str, source: Dict[str, Any]) -> str:
        with self.db.transaction() as cur:
            thread_id = source.get("thread_id") or source.get("source", {}).get("thread_id") or "manual"
            digest = source.get("digest") or f"digest-{chunk_id}"
            locator = source.get("locator") or source.get("locator_json") or {}
            source_type = source.get("source_type", "chatgpt_export_json")
            time_start = source.get("time_start") or source.get("time_range", {}).get("start")
            time_end = source.get("time_end") or source.get("time_range", {}).get("end")

            existing = cur.execute(
                "SELECT * FROM chunks WHERE digest = ?",
                (digest,),
            ).fetchone()

            if existing:
                chunk_id = existing["chunk_id"]
                cur.execute(
                    """
                    UPDATE chunks
                    SET thread_id = ?, source_type = ?, time_start = ?, time_end = ?, locator_json = ?, hint = ?
                    WHERE chunk_id = ?
                    """,
                    (thread_id, source_type, time_start, time_end, json.dumps(locator), source.get("hint"), chunk_id),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO chunks(chunk_id, thread_id, source_type, time_start, time_end, digest, locator_json, hint)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        chunk_id,
                        thread_id,
                        source_type,
                        time_start,
                        time_end,
                        digest,
                        json.dumps(locator),
                        source.get("hint"),
                    ),
                )

            return chunk_id

    def has_chunk_with_digest(self, digest: str) -> bool:
        with self.db.connect() as conn:
            row = conn.execute("SELECT 1 FROM chunks WHERE digest = ?", (digest,)).fetchone()
            return bool(row)

    def find_item_by_stable_key(self, stable_key: str, kind: Optional[str] = None) -> Optional[Dict[str, Any]]:
        with self.db.connect() as conn:
            if kind:
                row = conn.execute(
                    "SELECT * FROM items WHERE stable_key = ? AND kind = ? ORDER BY updated_at DESC LIMIT 1",
                    (stable_key, kind),
                ).fetchone()
            else:
                row = conn.execute(
                    "SELECT * FROM items WHERE stable_key = ? ORDER BY updated_at DESC LIMIT 1",
                    (stable_key,),
                ).fetchone()
            return row_to_dict(row) if row else None


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
                (name, path or "", parent_id),
            )
            return cur.lastrowid

    def find_tag(self, name: str, path: Optional[str] = None) -> Optional[Dict[str, Any]]:
        with self.db.connect() as conn:
            row = conn.execute(
                "SELECT * FROM tags WHERE name = ? AND ifnull(path,'') = ifnull(?, '')",
                (name, path),
            ).fetchone()
            return row_to_dict(row) if row else None

    def find_or_create(self, tag: Dict[str, Any]) -> int:
        existing = self.find_tag(tag.get("name"), tag.get("path"))
        if existing:
            return int(existing["tag_id"])
        return self.create_tag(tag.get("name"), path=tag.get("path"))

    def add_tag_to_item(self, item_id: str, tag_id: int, confidence: float = 0.0) -> None:
        with self.db.transaction() as cur:
            cur.execute(
                """
                INSERT OR REPLACE INTO item_tags(item_id, tag_id, confidence)
                VALUES (?, ?, ?)
                """,
                (item_id, tag_id, confidence),
            )

    def clear_tags_for_item(self, item_id: str) -> None:
        with self.db.transaction() as cur:
            cur.execute("DELETE FROM item_tags WHERE item_id = ?", (item_id,))

    def replace_item_tags(self, item_id: str, tags: Sequence[Dict[str, Any]]) -> None:
        self.clear_tags_for_item(item_id)
        for tag in tags:
            tag_id = self.find_or_create(tag)
            self.add_tag_to_item(item_id, tag_id, confidence=tag.get("confidence", 0.0))

    def get_tags_for_item(self, item_id: str) -> List[Dict[str, Any]]:
        with self.db.connect() as conn:
            rows = conn.execute(
                """
                SELECT t.name, t.path, it.confidence
                FROM item_tags it
                JOIN tags t ON t.tag_id = it.tag_id
                WHERE it.item_id = ?
                ORDER BY t.name
                """,
                (item_id,),
            ).fetchall()
            return [row_to_dict(r) for r in rows]

    def list_tags(self) -> List[Dict[str, Any]]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM tags ORDER BY tag_id").fetchall()
            return [row_to_dict(r) for r in rows]

    def suggest_tags(self, prefix: str, limit: int = 20) -> List[str]:
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT name FROM tags WHERE name LIKE ? || '%' ORDER BY name LIMIT ?",
                (prefix, limit),
            ).fetchall()
            return [r["name"] for r in rows]


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

    def list_links_for_item(self, item_id: str, include_targets: bool = False) -> List[Dict[str, Any]]:
        with self.db.connect() as conn:
            if not include_targets:
                rows = conn.execute(
                    "SELECT * FROM item_links WHERE item_id = ?", (item_id,)
                ).fetchall()
                return [row_to_dict(r) for r in rows]

            rows = conn.execute(
                """
                SELECT l.link_id, l.item_id, l.rel, l.target_key, l.note, l.confidence, t.title AS target_title, t.kind AS target_kind
                FROM item_links l
                LEFT JOIN items t ON t.item_id = l.target_key
                WHERE l.item_id = ?
                ORDER BY l.created_at
                """,
                (item_id,),
            ).fetchall()
            return [row_to_dict(r) for r in rows]

    def delete_link(self, link_id: str) -> None:
        with self.db.transaction() as cur:
            cur.execute("DELETE FROM item_links WHERE link_id = ?", (link_id,))


class SearchRepo:
    def __init__(self, db: Database) -> None:
        self.db = db

    def _build_match(self, query: str) -> str:
        safe_terms = []
        for term in query.split():
            cleaned = term.replace('"', '""')
            safe_terms.append(f'"{cleaned}"')
        return " ".join(safe_terms)

    def search_items(
        self,
        *,
        query: Optional[str] = None,
        kinds: Optional[Sequence[str]] = None,
        domain: Optional[str] = None,
        tags: Optional[Sequence[str]] = None,
        sort: str = "relevance",
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        kinds = kinds or []
        tags = tags or []

        params: List[Any] = []
        where_clauses = []

        if kinds:
            placeholders = ",".join(["?"] * len(kinds))
            where_clauses.append(f"i.kind IN ({placeholders})")
            params.extend(kinds)

        if domain:
            where_clauses.append("i.domain = ?")
            params.append(domain)

        join = ""
        if tags:
            join = " JOIN item_tags it ON it.item_id = i.item_id JOIN tags t ON t.tag_id = it.tag_id "
            where_clauses.append(
                "i.item_id IN (SELECT it2.item_id FROM item_tags it2 JOIN tags t2 ON t2.tag_id = it2.tag_id WHERE t2.name IN (%s) GROUP BY it2.item_id HAVING COUNT(*) >= ? )"
                % ",".join(["?"] * len(tags))
            )
            params.extend(tags)
            params.append(len(tags))

        if sort == "relevance" and query:
            order_clause = "ORDER BY bm25(f)"
        elif sort == "created":
            order_clause = "ORDER BY i.created_at DESC"
        else:
            order_clause = "ORDER BY i.updated_at DESC"

        if query:
            match_query = self._build_match(query)
            sql = (
                "SELECT i.item_id, i.kind, i.schema_id, i.title, i.body, i.domain, i.created_at, i.updated_at, i.confidence, "
                "(SELECT json_group_array(t.name) FROM item_tags it2 JOIN tags t ON t.tag_id = it2.tag_id WHERE it2.item_id = i.item_id) AS tags_json "
                "FROM items_fts f JOIN items i ON i.item_id = f.item_id "
                f"{join} "
            )
            if where_clauses:
                sql += "WHERE f MATCH ? AND " + " AND ".join(where_clauses) + " "
            else:
                sql += "WHERE f MATCH ? "
            sql += f"{order_clause} LIMIT ? OFFSET ?"
            params = [match_query, *params, limit, offset]
        else:
            sql = (
                "SELECT i.item_id, i.kind, i.schema_id, i.title, i.body, i.domain, i.created_at, i.updated_at, i.confidence, "
                "(SELECT json_group_array(t.name) FROM item_tags it2 JOIN tags t ON t.tag_id = it2.tag_id WHERE it2.item_id = i.item_id) AS tags_json "
                "FROM items i "
                f"{join} "
            )
            if where_clauses:
                sql += "WHERE " + " AND ".join(where_clauses) + " "
            sql += f"{order_clause} LIMIT ? OFFSET ?"
            params.extend([limit, offset])

        with self.db.connect() as conn:
            rows = conn.execute(sql, tuple(params)).fetchall()
            items = []
            for row in rows:
                item = row_to_dict(row)
                tags_json = item.pop("tags_json", None)
                if tags_json:
                    try:
                        item["tags"] = json.loads(tags_json)
                    except json.JSONDecodeError:
                        item["tags"] = []
                else:
                    item["tags"] = []
                items.append(item)
            return {"total": len(items), "items": items}

    def suggest_domains(self, prefix: str, limit: int = 20) -> List[str]:
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT DISTINCT domain FROM items WHERE domain LIKE ? || '%' ORDER BY domain LIMIT ?",
                (prefix, limit),
            ).fetchall()
            return [r["domain"] for r in rows if r["domain"]]


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

    def get_candidate(self, candidate_id: str) -> Optional[Dict[str, Any]]:
        with self.db.connect() as conn:
            row = conn.execute(
                "SELECT * FROM import_candidates WHERE candidate_id = ?", (candidate_id,)
            ).fetchone()
            return row_to_dict(row) if row else None

    def update_candidate(
        self,
        *,
        candidate_id: str,
        decision: str,
        skip_type: str,
        reason: Optional[str],
        item_json: Optional[Dict[str, Any]],
    ) -> None:
        with self.db.transaction() as cur:
            cur.execute(
                """
                UPDATE import_candidates
                SET decision = ?, skip_type = ?, reason = ?, item_json = ?
                WHERE candidate_id = ?
                """,
                (decision, skip_type, reason, json.dumps(item_json), candidate_id),
            )

    def mark_job_status(self, job_id: str, status: str) -> None:
        with self.db.transaction() as cur:
            cur.execute(
                "UPDATE import_jobs SET status = ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE job_id = ?",
                (status, job_id),
            )


__all__ = [
    "ItemsRepo",
    "TagsRepo",
    "LinksRepo",
    "SearchRepo",
    "ImportRepo",
]