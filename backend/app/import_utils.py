from __future__ import annotations

import hashlib
from typing import Any, Iterable


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())


def _hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def compute_thread_id(messages: Iterable[dict[str, Any]]) -> str:
    parts = []
    for message in list(messages)[:4]:
        role = normalize_text(message.get("role", ""))
        content = normalize_text(message.get("content", ""))
        parts.append(f"{role}:{content}")
    joined = "\n".join(parts)
    return f"t:{_hash_text(joined)}"


def compute_digest(thread_id: str, turn_range: dict[str, Any]) -> str | None:
    start = turn_range.get("start")
    end = turn_range.get("end")
    if start is None and end is None:
        return None
    raw = normalize_text(f"{thread_id}|{start}|{end}")
    return _hash_text(raw)