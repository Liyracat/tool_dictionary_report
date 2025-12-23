from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .db import Database, ensure_schema, default_schema_path
from .repositories import ImportRepo, ItemsRepo, LinksRepo, SearchRepo, TagsRepo


APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent


def default_db_path() -> Path:
    """Determine the DB path from env or fall back to project storage."""

    if db_env := os.environ.get("DB_PATH"):
        return Path(db_env)
    return PROJECT_ROOT / "data" / "app.db"

def create_app(
    *, db_path: Optional[str] = None, schema_path: Optional[str] = None
) -> FastAPI:
    database_path = Path(db_path) if db_path else default_db_path()
    schema_file = Path(schema_path) if schema_path else default_schema_path()

    db = Database(database_path)
    ensure_schema(db, schema_file)

    app = FastAPI(title="Tool Dictionary Report API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.db = db

    def get_items_repo() -> ItemsRepo:
        return ItemsRepo(app.state.db)

    def get_tags_repo() -> TagsRepo:
        return TagsRepo(app.state.db)

    def get_links_repo() -> LinksRepo:
        return LinksRepo(app.state.db)

    def get_search_repo() -> SearchRepo:
        return SearchRepo(app.state.db)

    def get_import_repo() -> ImportRepo:
        return ImportRepo(app.state.db)

    @app.get("/api/health")
    def health() -> Dict[str, str]:
        try:
            app.state.db.health_check()
            return {"status": "ok", "database": "connected"}
        except Exception as exc:  # pragma: no cover - defensive path
            raise HTTPException(status_code=503, detail="database_error") from exc

    @app.get("/api/items/{item_id}")
    def get_item(
        item_id: str,
        items: ItemsRepo = Depends(get_items_repo),
        tags: TagsRepo = Depends(get_tags_repo),
    ) -> Dict[str, Any]:
        item = items.get_item(item_id)
        if not item:
            raise HTTPException(status_code=404, detail="item_not_found")

        payload = items.get_payload(item_id)
        item_tags = tags.get_tags_for_item(item_id)
        item.update({"payload": payload, "tags": item_tags})
        return {"item": item}

    @app.post("/api/items")
    def create_item(
        payload: Dict[str, Any],
        items: ItemsRepo = Depends(get_items_repo),
        tags: TagsRepo = Depends(get_tags_repo),
    ) -> Dict[str, str]:
        item_id = f"item-{uuid.uuid4()}"
        chunk_id = payload.get("chunk_id") or f"chunk-{uuid.uuid4()}"
        items.ensure_chunk_for_item(chunk_id, payload)

        items.create_item(
            item_id=item_id,
            chunk_id=chunk_id,
            kind=payload["kind"],
            schema_id=payload["schema_id"],
            title=payload["title"],
            body=payload["body"],
            stable_key=payload.get("stable_key"),
            domain=payload.get("domain"),
            confidence=payload.get("confidence", 0.0),
            status="active",
            evidence_basis=json.dumps(payload.get("evidence", {})),
        )
        items.add_payload(item_id, payload.get("payload", {}))
        tags.replace_item_tags(item_id, payload.get("tags", []))
        return {"item_id": item_id}

    @app.put("/api/items/{item_id}")
    def update_item(
        item_id: str,
        payload: Dict[str, Any],
        items: ItemsRepo = Depends(get_items_repo),
        tags: TagsRepo = Depends(get_tags_repo),
    ) -> Dict[str, bool]:
        if not items.get_item(item_id):
            raise HTTPException(status_code=404, detail="item_not_found")

        items.update_item(
            item_id=item_id,
            kind=payload["kind"],
            schema_id=payload["schema_id"],
            title=payload["title"],
            body=payload["body"],
            stable_key=payload.get("stable_key"),
            domain=payload.get("domain"),
            confidence=payload.get("confidence", 0.0),
            status=payload.get("status", "active"),
            evidence_basis=json.dumps(payload.get("evidence", {})),
        )
        items.add_payload(item_id, payload.get("payload", {}))
        tags.replace_item_tags(item_id, payload.get("tags", []))
        return {"ok": True}

    @app.delete("/api/items/{item_id}")
    def delete_item(item_id: str, items: ItemsRepo = Depends(get_items_repo)) -> Dict[str, bool]:
        if not items.get_item(item_id):
            raise HTTPException(status_code=404, detail="item_not_found")
        items.soft_delete(item_id)
        return {"ok": True}

    @app.get("/api/items/{item_id}/links")
    def get_links(
        item_id: str, links: LinksRepo = Depends(get_links_repo)
    ) -> Dict[str, Any]:
        return {"links": links.list_links_for_item(item_id, include_targets=True)}

    @app.post("/api/items/{item_id}/links")
    def create_link(
        item_id: str,
        body: Dict[str, Any],
        links: LinksRepo = Depends(get_links_repo),
    ) -> Dict[str, str]:
        link_id = f"link-{uuid.uuid4()}"
        links.create_link(
            link_id=link_id,
            item_id=item_id,
            rel=body["rel"],
            target_key=body["target_item_id"],
            note=body.get("note"),
            confidence=body.get("confidence", 0.0),
        )
        return {"link_id": link_id}

    @app.delete("/api/links/{link_id}")
    def delete_link(link_id: str, links: LinksRepo = Depends(get_links_repo)) -> Dict[str, bool]:
        links.delete_link(link_id)
        return {"ok": True}

    @app.get("/api/suggest/tags")
    def suggest_tags(
        q: str = Query("", description="Prefix query"),
        limit: int = Query(20, ge=1, le=100),
        tags: TagsRepo = Depends(get_tags_repo),
    ) -> Dict[str, List[str]]:
        return {"tags": tags.suggest_tags(q, limit=limit)}

    @app.get("/api/suggest/domains")
    def suggest_domains(
        q: str = Query("", description="Prefix query"),
        limit: int = Query(20, ge=1, le=100),
        search: SearchRepo = Depends(get_search_repo),
    ) -> Dict[str, List[str]]:
        return {"domains": search.suggest_domains(q, limit=limit)}

    @app.get("/api/search")
    def search_items(
        q: Optional[str] = None,
        kinds: Optional[str] = None,
        domain: Optional[str] = None,
        tags: Optional[str] = None,
        sort: str = "relevance",
        limit: int = Query(20, ge=1, le=100),
        offset: int = Query(0, ge=0),
        search: SearchRepo = Depends(get_search_repo),
    ) -> Dict[str, Any]:
        kinds_list = [k.strip() for k in kinds.split(",") if k.strip()] if kinds else []
        tags_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
        results = search.search_items(
            query=q,
            kinds=kinds_list,
            domain=domain,
            tags=tags_list,
            sort=sort,
            limit=limit,
            offset=offset,
        )
        return results

    @app.post("/api/import/jobs")
    def create_import_job(
        body: Dict[str, Any],
        repo: ImportRepo = Depends(get_import_repo),
    ) -> Dict[str, str]:
        extraction = body.get("extraction")
        if not extraction:
            raise HTTPException(status_code=400, detail="missing_extraction")

        job_id = f"job-{uuid.uuid4()}"
        source = extraction.get("source", {})
        repo.create_job(
            job_id=job_id,
            source_json=source,
            source_type=source.get("source_type", "chatgpt_export_json"),
            thread_id=source.get("thread_id"),
            chunk_id=source.get("chunk_id"),
            digest=source.get("digest"),
            hint=source.get("hint"),
        )

        items = extraction.get("items", [])
        for item in items:
            candidate_id = f"cand-{uuid.uuid4()}"
            repo.add_candidate(
                candidate_id=candidate_id,
                job_id=job_id,
                temp_item_id=item.get("item_id", f"temp-{uuid.uuid4()}"),
                item_json=item,
                decision=item.get("decision", extraction.get("classification", {}).get("decision", "KEEP")),
                skip_type=item.get("skip_type", extraction.get("classification", {}).get("skip_type", "NONE")),
                reason=item.get("reason", extraction.get("classification", {}).get("reason")),
            )
        return {"job_id": job_id}

    @app.get("/api/import/jobs/{job_id}")
    def get_import_job(job_id: str, repo: ImportRepo = Depends(get_import_repo)) -> Dict[str, Any]:
        job = repo.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="job_not_found")
        candidates = repo.list_candidates(job_id)
        parsed_candidates = []
        for cand in candidates:
            parsed_candidates.append(
                {
                    "candidate_id": cand["candidate_id"],
                    "decision": cand["decision"],
                    "skip_type": cand["skip_type"],
                    "reason": cand["reason"],
                    "item": json.loads(cand["item_json"]),
                }
            )
        job["source"] = json.loads(job.get("source_json", "{}"))
        return {"job": job, "candidates": parsed_candidates}

    @app.put("/api/import/jobs/{job_id}/candidates/{candidate_id}")
    def update_candidate(
        job_id: str,
        candidate_id: str,
        body: Dict[str, Any],
        repo: ImportRepo = Depends(get_import_repo),
    ) -> Dict[str, bool]:
        if not repo.get_candidate(candidate_id):
            raise HTTPException(status_code=404, detail="candidate_not_found")
        repo.update_candidate(
            candidate_id=candidate_id,
            decision=body.get("decision", "KEEP"),
            skip_type=body.get("skip_type", "NONE"),
            reason=body.get("reason"),
            item_json=body.get("item"),
        )
        return {"ok": True}

    @app.post("/api/import/jobs/{job_id}/commit")
    def commit_job(
        job_id: str,
        repo: ImportRepo = Depends(get_import_repo),
        items_repo: ItemsRepo = Depends(get_items_repo),
        tags_repo: TagsRepo = Depends(get_tags_repo),
        links_repo: LinksRepo = Depends(get_links_repo),
    ) -> Dict[str, Any]:
        job = repo.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="job_not_found")
        if job.get("status") == "committed":
            raise HTTPException(status_code=400, detail="already_committed")

        digest = job.get("digest")
        if digest and items_repo.has_chunk_with_digest(digest):
            raise HTTPException(status_code=409, detail="chunk_already_exists")

        candidates = repo.list_candidates(job_id)
        keep_candidates = [c for c in candidates if c["decision"] == "KEEP"]
        id_map: Dict[str, str] = {}
        inserted = 0
        for cand in keep_candidates:
            item_payload = json.loads(cand["item_json"])
            item_id = f"item-{uuid.uuid4()}"
            id_map[item_payload.get("item_id")] = item_id

            chunk_id = job.get("chunk_id") or f"chunk-{uuid.uuid4()}"
            items_repo.ensure_chunk_for_item(chunk_id, job)

            items_repo.create_item(
                item_id=item_id,
                chunk_id=chunk_id,
                kind=item_payload["kind"],
                schema_id=item_payload["schema_id"],
                title=item_payload["title"],
                body=item_payload["body"],
                stable_key=item_payload.get("stable_key"),
                domain=item_payload.get("domain"),
                confidence=item_payload.get("confidence", 0.0),
                status="active",
                evidence_basis=json.dumps(item_payload.get("evidence", {})),
            )
            items_repo.add_payload(item_id, item_payload.get("payload", {}))
            tags_repo.replace_item_tags(item_id, item_payload.get("tags", []))
            repo.map_temp_id(job_id=job_id, temp_item_id=item_payload.get("item_id"), item_id=item_id)
            inserted += 1

        created_links = 0
        for cand in keep_candidates:
            item_payload = json.loads(cand["item_json"])
            source_new_id = id_map.get(item_payload.get("item_id"))
            if not source_new_id:
                continue
            for link in item_payload.get("links", []):
                target_temp = link.get("target_key") or link.get("target_item_id")
                target_real = id_map.get(target_temp, target_temp)
                links_repo.create_link(
                    link_id=f"link-{uuid.uuid4()}",
                    item_id=source_new_id,
                    rel=link["rel"],
                    target_key=target_real,
                    note=link.get("note"),
                    confidence=link.get("confidence", 0.0),
                )
                created_links += 1

        repo.mark_job_status(job_id, status="committed")
        return {
            "ok": True,
            "inserted": inserted,
            "updated": 0,
            "skipped": len(candidates) - len(keep_candidates),
            "links_created": created_links,
            "warnings": [],
        }

    @app.post("/api/import/jobs/{job_id}/discard")
    def discard_job(job_id: str, repo: ImportRepo = Depends(get_import_repo)) -> Dict[str, bool]:
        if not repo.get_job(job_id):
            raise HTTPException(status_code=404, detail="job_not_found")
        repo.mark_job_status(job_id, status="discarded")
        return {"ok": True}

    return app


__all__ = ["create_app"]