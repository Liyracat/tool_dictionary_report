from __future__ import annotations

import inspect
import json
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional


class HTTPException(Exception):
    def __init__(self, status_code: int, detail: Any = None) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class Depends:
    def __init__(self, dependency: Callable[..., Any]) -> None:
        self.dependency = dependency


class Query:
    def __init__(self, default: Any = None, **_: Any) -> None:
        self.default = default


@dataclass
class Route:
    method: str
    path: str
    handler: Callable[..., Any]
    segments: List[str]


class FastAPI:
    def __init__(self, title: str | None = None) -> None:
        self.title = title
        self.routes: List[Route] = []
        self.state = type("State", (), {})()

    def add_middleware(self, *args: Any, **kwargs: Any) -> None:  # pragma: no cover - stub
        return None

    def _add_route(self, method: str, path: str, handler: Callable[..., Any]) -> Callable[..., Any]:
        segments = [seg for seg in path.strip("/").split("/") if seg]
        self.routes.append(Route(method=method, path=path, handler=handler, segments=segments))
        return handler

    def get(self, path: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
            return self._add_route("GET", path, fn)

        return decorator

    def post(self, path: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
            return self._add_route("POST", path, fn)

        return decorator

    def put(self, path: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
            return self._add_route("PUT", path, fn)

        return decorator

    def delete(self, path: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
            return self._add_route("DELETE", path, fn)

        return decorator

    def _match_route(self, method: str, path: str) -> tuple[Route, Dict[str, str]]:
        path_segments = [seg for seg in path.strip("/").split("/") if seg]
        for route in self.routes:
            if route.method != method:
                continue
            if len(route.segments) != len(path_segments):
                continue
            params: Dict[str, str] = {}
            matched = True
            for route_seg, seg in zip(route.segments, path_segments):
                if route_seg.startswith("{") and route_seg.endswith("}"):
                    params[route_seg.strip("{} ")] = seg
                elif route_seg != seg:
                    matched = False
                    break
            if matched:
                return route, params
        raise HTTPException(status_code=404, detail="not_found")

    def dispatch(
        self,
        method: str,
        path: str,
        *,
        query_params: Optional[Dict[str, Any]] = None,
        json_body: Optional[Dict[str, Any]] = None,
    ) -> tuple[int, Any]:
        route, params = self._match_route(method, path)
        query_params = query_params or {}
        json_body = json_body or {}

        try:
            status, payload = self._call_handler(route.handler, params, query_params, json_body)
            return status, payload
        except HTTPException as exc:
            return exc.status_code, {"detail": exc.detail}

    def _call_handler(
        self,
        handler: Callable[..., Any],
        path_params: Dict[str, Any],
        query_params: Dict[str, Any],
        json_body: Dict[str, Any],
    ) -> tuple[int, Any]:
        signature = inspect.signature(handler)
        kwargs: Dict[str, Any] = {}
        for name, param in signature.parameters.items():
            annotation = param.annotation
            origin = getattr(annotation, "__origin__", None)
            annotation_name = annotation.lower() if isinstance(annotation, str) else ""
            if name in path_params:
                kwargs[name] = path_params[name]
                continue
            if name in query_params:
                kwargs[name] = query_params[name]
                continue
            if param.default is inspect._empty and isinstance(json_body, dict):
                if (
                    annotation in (dict, Any, Dict)
                    or origin is dict
                    or annotation_name.startswith("dict")
                ):
                    kwargs[name] = json_body
                    continue
            default = param.default
            if isinstance(default, Depends):
                kwargs[name] = default.dependency()
                continue
            if isinstance(default, Query):
                kwargs[name] = default.default
                continue
            if name in json_body:
                kwargs[name] = json_body[name]
                continue
            if default is inspect._empty:
                kwargs[name] = json_body
            else:
                kwargs[name] = default

        result = handler(**kwargs)
        if isinstance(result, tuple) and len(result) == 2:
            return result  # type: ignore[return-value]
        return 200, result


from .testclient import TestClient  # noqa: E402,F401
