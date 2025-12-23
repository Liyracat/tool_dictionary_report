import json
from pathlib import Path

from app.db import Database, ensure_schema
from app.repositories import ImportRepo, ItemsRepo, LinksRepo, SearchRepo, TagsRepo


def setup_db(tmp_path: Path) -> Database:
    db_path = tmp_path / "repo.sqlite"
    schema_path = Path(__file__).resolve().parent.parent / "schema.sql"
    db = Database(db_path)
    ensure_schema(db, schema_path)
    return db


def create_sample_item(db: Database, item_id: str = "item-1", chunk_id: str = "chunk-1") -> None:
    items_repo = ItemsRepo(db)
    items_repo.create_chunk(
        chunk_id=chunk_id,
        thread_id="thread-1",
        digest="digest-1",
        locator_json=json.dumps({"path": "sample"}),
    )
    items_repo.create_item(
        item_id=item_id,
        chunk_id=chunk_id,
        kind="knowledge",
        schema_id="knowledge/howto.v1",
        title="example",
        body="body",
    )


def test_items_repository_can_persist_and_load(tmp_path: Path) -> None:
    db = setup_db(tmp_path)
    create_sample_item(db)

    items_repo = ItemsRepo(db)
    stored = items_repo.get_item("item-1")

    assert stored is not None
    assert stored["item_id"] == "item-1"


def test_tags_and_links_workflow(tmp_path: Path) -> None:
    db = setup_db(tmp_path)
    create_sample_item(db)

    tags_repo = TagsRepo(db)
    links_repo = LinksRepo(db)

    tag_id = tags_repo.create_tag("sample", path="demo")
    tags_repo.add_tag_to_item("item-1", tag_id, confidence=0.8)

    links_repo.create_link(
        link_id="link-1",
        item_id="item-1",
        rel="related",
        target_key="item-1",
        note="self link",
        confidence=0.5,
    )

    tagged = tags_repo.list_tags()
    links = links_repo.list_links_for_item("item-1")

    assert tagged[0]["name"] == "sample"
    assert links[0]["rel"] == "related"


def test_search_repository_uses_fts(tmp_path: Path) -> None:
    db = setup_db(tmp_path)
    create_sample_item(db, item_id="item-search")

    search_repo = SearchRepo(db)
        results = search_repo.search_items(query="example")
␊
    assert results["items"] and results["items"][0]["item_id"] == "item-search"


def test_import_repository(tmp_path: Path) -> None:
    db = setup_db(tmp_path)
    repo = ImportRepo(db)

    repo.create_job(job_id="job-1", source_json={"foo": "bar"})
    repo.add_candidate(
        candidate_id="cand-1",
        job_id="job-1",
        temp_item_id="temp-id:1",
        item_json={"item": "value"},
        decision="KEEP",
    )
    repo.map_temp_id(job_id="job-1", temp_item_id="temp-id:1", item_id="real-item")

    job = repo.get_job("job-1")
    candidates = repo.list_candidates("job-1")

    assert job is not None and job["job_id"] == "job-1"
    assert candidates and candidates[0]["candidate_id"] == "cand-1"