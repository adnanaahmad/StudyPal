"""
SQLite-backed podcast store for StudyPal Podcasts Hub.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any

from deeptutor.services.path_service import get_path_service


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _json_loads(value: str | None, default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


class SQLitePodcastStore:
    """Persist generated podcast metadata and scripts in a SQLite database."""

    def __init__(self, db_path: Path | None = None) -> None:
        path_service = get_path_service()
        self.db_path = db_path or path_service.get_user_root() / "podcasts.db"
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()
        self._initialize()

    def _initialize(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS podcasts (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    script_json TEXT DEFAULT '[]',
                    duration REAL DEFAULT 0,
                    audio_url TEXT DEFAULT '',
                    status TEXT DEFAULT 'generating',
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_podcasts_created_at
                    ON podcasts(created_at DESC);
                """
            )
            conn.commit()

    async def _run(self, fn, *args):
        async with self._lock:
            return await asyncio.to_thread(fn, *args)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _create_podcast_sync(self, title: str) -> dict[str, Any]:
        now = time.time()
        podcast_id = f"podcast_{int(now * 1000)}_{uuid.uuid4().hex[:8]}"
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO podcasts (id, title, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                """,
                (podcast_id, title[:200], now, now),
            )
            conn.commit()
        return {
            "id": podcast_id,
            "title": title[:200],
            "script_json": "[]",
            "duration": 0.0,
            "audio_url": "",
            "status": "generating",
            "created_at": now,
            "updated_at": now,
        }

    async def create_podcast(self, title: str) -> dict[str, Any]:
        return await self._run(self._create_podcast_sync, title)

    def _update_podcast_sync(self, podcast_id: str, updates: dict[str, Any]) -> bool:
        now = time.time()
        fields = []
        values = []
        for k, v in updates.items():
            if k in {"title", "duration", "audio_url", "status"}:
                fields.append(f"{k} = ?")
                values.append(v)
            elif k == "script_json":
                fields.append("script_json = ?")
                values.append(_json_dumps(v) if not isinstance(v, str) else v)
        
        if not fields:
            return False

        fields.append("updated_at = ?")
        values.append(now)
        values.append(podcast_id)

        query = f"UPDATE podcasts SET {', '.join(fields)} WHERE id = ?"
        with self._connect() as conn:
            cur = conn.execute(query, tuple(values))
            conn.commit()
            return cur.rowcount > 0

    async def update_podcast(self, podcast_id: str, updates: dict[str, Any]) -> bool:
        return await self._run(self._update_podcast_sync, podcast_id, updates)

    def _get_podcast_sync(self, podcast_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM podcasts WHERE id = ?", (podcast_id,)).fetchone()
            if not row:
                return None
            payload = dict(row)
            payload["script"] = _json_loads(payload.pop("script_json"), [])
            return payload

    async def get_podcast(self, podcast_id: str) -> dict[str, Any] | None:
        return await self._run(self._get_podcast_sync, podcast_id)

    def _list_podcasts_sync(self, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, title, duration, audio_url, status, created_at, updated_at
                FROM podcasts
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            ).fetchall()
            
            return [dict(row) for row in rows]

    async def list_podcasts(self, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        return await self._run(self._list_podcasts_sync, limit, offset)


_instance: SQLitePodcastStore | None = None


def get_sqlite_podcast_store() -> SQLitePodcastStore:
    global _instance
    if _instance is None:
        _instance = SQLitePodcastStore()
    return _instance
