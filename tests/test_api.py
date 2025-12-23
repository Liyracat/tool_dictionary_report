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