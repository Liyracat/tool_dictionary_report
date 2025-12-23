import json
import threading
from http.client import HTTPConnection
from pathlib import Path

from app.main import create_server


def test_health_endpoint_uses_database(tmp_path: Path) -> None:
    db_path = tmp_path / "health.sqlite"
    schema_path = Path(__file__).resolve().parent.parent / "schema.sql"
    server = create_server(host="127.0.0.1", port=0, db_path=str(db_path), schema_path=str(schema_path))

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    host, port = server.server_address
    conn = HTTPConnection(host, port)
    conn.request("GET", "/api/health")
    response = conn.getresponse()

    body = json.loads(response.read())
    server.shutdown()
    thread.join()

    assert response.status == 200
    assert body == {"status": "ok", "database": "connected"}
    assert db_path.exists()