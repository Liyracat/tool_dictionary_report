from __future__ import annotations

import json
from typing import Any, Dict, Optional

from . import FastAPI


class Response:
    def __init__(self, status_code: int, data: Any) -> None:
        self.status_code = status_code
        self._data = data
        self.text = json.dumps(data) if not isinstance(data, (str, bytes)) else data  # type: ignore[assignment]

    def json(self) -> Any:
        if isinstance(self._data, (dict, list)):
            return self._data
        return json.loads(self._data)


class TestClient:
    def __init__(self, app: FastAPI) -> None:
        self.app = app

    def _request(self, method: str, path: str, *, params: Optional[Dict[str, Any]] = None, json: Optional[Dict[str, Any]] = None) -> Response:  # noqa: A002 - align with requests
        status, payload = self.app.dispatch(method, path, query_params=params, json_body=json)
        return Response(status, payload)

    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Response:
        return self._request("GET", path, params=params)

    def post(self, path: str, json: Optional[Dict[str, Any]] = None) -> Response:  # noqa: A002
        return self._request("POST", path, json=json)

    def put(self, path: str, json: Optional[Dict[str, Any]] = None) -> Response:  # noqa: A002
        return self._request("PUT", path, json=json)

    def delete(self, path: str) -> Response:
        return self._request("DELETE", path)