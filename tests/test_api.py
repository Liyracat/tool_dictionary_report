from pathlib import Path

from fastapi.testclient import TestClient

from app.db import Database
from app.main import create_app


def make_client(tmp_path: Path) -> tuple[TestClient, Path]:
    db_path = tmp_path / "api.sqlite"
    schema_path = Path(__file__).resolve().parent.parent / "schema.sql"
    app = create_app(db_path=str(db_path), schema_path=str(schema_path))
    return TestClient(app), db_path


def test_item_crud_and_search(tmp_path: Path) -> None:
    client, db_path = make_client(tmp_path)

    item_payload = {
        "kind": "knowledge",
        "schema_id": "knowledge/howto.v1",
        "title": "Learn FTS5",
        "body": "FTS5 enables fast search",
        "domain": "search.sqlite",
        "tags": [{"name": "fts5", "confidence": 0.9}],
        "payload": {"notes": "remember triggers"},
        "evidence": {"basis": "docs"},
    }

    created = client.post("/api/items", json=item_payload)
    assert created.status_code == 200
    item_id = created.json()["item_id"]

    fetched = client.get(f"/api/items/{item_id}")
    assert fetched.status_code == 200
    body = fetched.json()["item"]
    assert body["title"] == "Learn FTS5"
    assert body["tags"]

    update_payload = {**item_payload, "title": "Learn SQLite FTS5"}
    assert client.put(f"/api/items/{item_id}", json=update_payload).status_code == 200

    search = client.get("/api/search", params={"q": "SQLite", "limit": 5})
    assert search.status_code == 200
    result_items = search.json()["items"]
    assert result_items and result_items[0]["item_id"] == item_id

    delete_resp = client.delete(f"/api/items/{item_id}")
    assert delete_resp.status_code == 200
    assert db_path.exists()


def test_import_commit_creates_items_and_links(tmp_path: Path) -> None:
    client, db_path = make_client(tmp_path)

    extraction = {
        "source": {
            "thread_id": "thread-1",
            "chunk_id": "chunk-temp",
            "digest": "digest-123",
            "locator": {"path": "sample"},
        },
        "items": [
            {
                "item_id": "temp-id:1",
                "kind": "summary",
                "schema_id": "summary/basic.v1",
                "title": "First",
                "body": "First body",
                "links": [{"rel": "related", "target_key": "temp-id:2"}],
            },
            {
                "item_id": "temp-id:2",
                "kind": "summary",
                "schema_id": "summary/basic.v1",
                "title": "Second",
                "body": "Second body",
            },
        ],
    }

    job_resp = client.post("/api/import/jobs", json={"extraction": extraction})
    assert job_resp.status_code == 200
    job_id = job_resp.json()["job_id"]

    fetched_job = client.get(f"/api/import/jobs/{job_id}")
    assert fetched_job.status_code == 200
    assert len(fetched_job.json()["candidates"]) == 2

    commit = client.post(f"/api/import/jobs/{job_id}/commit")
    assert commit.status_code == 200
    assert commit.json()["inserted"] == 2

    db = Database(db_path)
    with db.connect() as conn:
        items = conn.execute("SELECT item_id FROM items").fetchall()
        links = conn.execute("SELECT * FROM item_links").fetchall()

    assert len(items) == 2
    assert len(links) == 1


def test_import_commit_updates_existing_chunk_on_duplicate_digest(tmp_path: Path) -> None:
    client, db_path = make_client(tmp_path)

    first_extraction = {
        "source": {"thread_id": "thread-1", "digest": "digest-dup", "hint": "old"},
        "items": [
            {
                "item_id": "temp-1",
                "kind": "summary",
                "schema_id": "summary/basic.v1",
                "title": "Old", 
                "body": "Old body",
            }
        ],
    }

    first_job = client.post("/api/import/jobs", json={"extraction": first_extraction})
    assert first_job.status_code == 200
    first_commit = client.post(f"/api/import/jobs/{first_job.json()['job_id']}/commit")
    assert first_commit.status_code == 200

    db = Database(db_path)
    with db.connect() as conn:
        initial_chunk = conn.execute("SELECT * FROM chunks").fetchone()

    second_extraction = {
        "source": {"thread_id": "thread-2", "digest": "digest-dup", "hint": "updated"},
        "items": [
            {
                "item_id": "temp-2",
                "kind": "summary",
                "schema_id": "summary/basic.v1",
                "title": "New", 
                "body": "New body",
            }
        ],
    }

    second_job = client.post("/api/import/jobs", json={"extraction": second_extraction})
    assert second_job.status_code == 200
    second_commit = client.post(f"/api/import/jobs/{second_job.json()['job_id']}/commit")
    assert second_commit.status_code == 200
    assert second_commit.json()["inserted"] == 1

    with db.connect() as conn:
        chunks = conn.execute("SELECT * FROM chunks").fetchall()

    assert len(chunks) == 1
    assert chunks[0]["chunk_id"] == initial_chunk["chunk_id"]
    assert chunks[0]["thread_id"] == "thread-2"
    assert chunks[0]["hint"] == "updated"


def test_import_commit_upserts_stateful_items_by_stable_key(tmp_path: Path) -> None:
    client, db_path = make_client(tmp_path)

    base_payload = {
        "kind": "knowledge",
        "schema_id": "knowledge/howto.v1",
        "title": "Initial title",
        "body": "Initial body",
        "stable_key": "knowledge/example",
        "tags": [{"name": "old"}],
    }

    created = client.post("/api/items", json=base_payload)
    assert created.status_code == 200
    existing_id = created.json()["item_id"]

    extraction = {
        "source": {"digest": "stateful-digest"},
        "items": [
            {
                "item_id": "temp-upsert",
                "kind": "knowledge",
                "schema_id": "knowledge/howto.v1",
                "title": "Updated title",
                "body": "Updated body",
                "stable_key": "knowledge/example",
                "domain": "imported",
                "tags": [{"name": "fresh"}],
            }
        ],
    }

    job = client.post("/api/import/jobs", json={"extraction": extraction})
    assert job.status_code == 200
    commit = client.post(f"/api/import/jobs/{job.json()['job_id']}/commit")
    assert commit.status_code == 200
    assert commit.json()["updated"] == 1
    assert commit.json()["inserted"] == 0

    detail = client.get(f"/api/items/{existing_id}")
    assert detail.status_code == 200
    item = detail.json()["item"]
    assert item["title"] == "Updated title"
    assert item["body"] == "Updated body"
    assert item["domain"] == "imported"
    assert any(tag.get("name") == "fresh" for tag in item.get("tags", []))