from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def test_health_endpoint_uses_database(tmp_path: Path) -> None:
    db_path = tmp_path / "health.sqlite"
    schema_path = Path(__file__).resolve().parent.parent / "schema.sql"

    app = create_app(db_path=str(db_path), schema_path=str(schema_path))
    client = TestClient(app)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "connected"}
    assert db_path.exists()