from __future__ import annotations

import json
import os
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Optional, Tuple

from .db import Database, ensure_schema


class HealthRequestHandler(BaseHTTPRequestHandler):
    def __init__(self, *args, db: Database, **kwargs) -> None:  # type: ignore[override]
        self.db = db
        super().__init__(*args, **kwargs)

    def do_GET(self) -> None:  # pragma: no cover - exercised via integration test
        if self.path != "/api/health":
            self.send_error(404, "Not Found")
            return

        try:
            self.db.health_check()
            payload = {"status": "ok", "database": "connected"}
            self._send_json(200, payload)
        except Exception:  # noqa: BLE001 - defensive
            self._send_json(503, {"detail": "database_error"})

    def log_message(self, format: str, *args) -> None:  # noqa: A003 - inherited name
        return  # silence default logging

    def _send_json(self, status_code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class AppServer(ThreadingHTTPServer):
    def __init__(self, server_address: Tuple[str, int], db: Database) -> None:
        handler = partial(HealthRequestHandler, db=db)
        super().__init__(server_address, handler)


def create_server(
    *,
    host: str = "0.0.0.0",
    port: int = 8000,
    db_path: Optional[str] = None,
    schema_path: Optional[str] = None,
) -> AppServer:
    database_path = Path(db_path or os.environ.get("DB_PATH", "db.sqlite"))
    schema_file = Path(schema_path or os.environ.get("SCHEMA_PATH", "schema.sql"))
    db = Database(database_path)
    ensure_schema(db, schema_file)
    return AppServer((host, port), db)


def serve_forever() -> None:  # pragma: no cover - helper for manual runs
    server = create_server()
    host, port = server.server_address
    print(f"Serving on http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


__all__ = ["create_server", "serve_forever", "AppServer", "HealthRequestHandler"]