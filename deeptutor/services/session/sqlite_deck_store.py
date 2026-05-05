"""SQLite-backed deck store for StudyPal Decks."""

from __future__ import annotations
import asyncio
import sqlite3
import time
import uuid
import json
from pathlib import Path
from typing import Any

from deeptutor.services.path_service import get_path_service

class SQLiteDeckStore:
    def __init__(self, db_path: Path | None = None) -> None:
        path_service = get_path_service()
        self.db_path = db_path or path_service.get_user_root() / "decks.db"
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()
        self._initialize()

    def _initialize(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS decks (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    slides_count INTEGER DEFAULT 0,
                    file_url TEXT DEFAULT '',
                    status TEXT DEFAULT 'generating',
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_decks_created_at ON decks(created_at DESC);
                """
            )
            conn.commit()

    async def _run(self, fn, *args):
        async with self._lock:
            return await asyncio.to_thread(fn, *args)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _create_deck_sync(self, title: str) -> dict[str, Any]:
        now = time.time()
        deck_id = f"deck_{int(now * 1000)}_{uuid.uuid4().hex[:8]}"
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO decks (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (deck_id, title[:200], now, now),
            )
            conn.commit()
        return {"id": deck_id, "title": title, "status": "generating", "created_at": now}

    async def create_deck(self, title: str) -> dict[str, Any]:
        return await self._run(self._create_deck_sync, title)

    def _update_deck_sync(self, deck_id: str, updates: dict[str, Any]) -> bool:
        fields = [f"{k} = ?" for k in updates.keys()]
        values = list(updates.values())
        values.append(deck_id)
        query = f"UPDATE decks SET {', '.join(fields)}, updated_at = {time.time()} WHERE id = ?"
        with self._connect() as conn:
            cur = conn.execute(query, tuple(values))
            conn.commit()
            return cur.rowcount > 0

    async def update_deck(self, deck_id: str, updates: dict[str, Any]) -> bool:
        return await self._run(self._update_deck_sync, deck_id, updates)

    def _list_decks_sync(self, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM decks ORDER BY created_at DESC LIMIT ? OFFSET ?", (limit, offset)).fetchall()
            return [dict(row) for row in rows]

    async def list_decks(self, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        return await self._run(self._list_decks_sync, limit, offset)

    def _get_deck_sync(self, deck_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM decks WHERE id = ?", (deck_id,)).fetchone()
            return dict(row) if row else None

    async def get_deck(self, deck_id: str) -> dict[str, Any] | None:
        return await self._run(self._get_deck_sync, deck_id)

_instance: SQLiteDeckStore | None = None
def get_sqlite_deck_store() -> SQLiteDeckStore:
    global _instance
    if _instance is None:
        _instance = SQLiteDeckStore()
    return _instance
