"""API Router for Decks Hub"""

import asyncio
import logging
from typing import Any
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from deeptutor.services.session.sqlite_deck_store import get_sqlite_deck_store
from deeptutor.core.context import UnifiedContext
from deeptutor.runtime.orchestrator import ChatOrchestrator
from deeptutor.core.stream_bus import StreamBus

logger = logging.getLogger(__name__)
router = APIRouter()

class GenerateDeckRequest(BaseModel):
    title: str
    topic: str
    source_text: str | None = None

class DeckResponse(BaseModel):
    id: str
    title: str
    slides_count: int
    status: str
    created_at: float
    file_url: str | None = None

@router.get("", response_model=list[DeckResponse])
async def list_decks(limit: int = 50, offset: int = 0):
    store = get_sqlite_deck_store()
    return await store.list_decks(limit, offset)

@router.post("/generate")
async def generate_deck(req: GenerateDeckRequest, background_tasks: BackgroundTasks):
    store = get_sqlite_deck_store()
    deck = await store.create_deck(req.title)
    
    background_tasks.add_task(
        _run_presenter_capability,
        deck_id=deck["id"],
        topic=req.topic,
        source_text=req.source_text
    )
    
    return {"id": deck["id"], "status": "generating"}

@router.get("/{deck_id}", response_model=DeckResponse)
async def get_deck(deck_id: str):
    store = get_sqlite_deck_store()
    deck = await store.get_deck(deck_id)
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    return deck

async def _run_presenter_capability(deck_id: str, topic: str, source_text: str | None):
    try:
        from deeptutor.core.stream import StreamEventType
        store = get_sqlite_deck_store()
        orchestrator = ChatOrchestrator()
        
        context = UnifiedContext(
            user_message=topic,
            active_capability="presenter",
            metadata={"source_text": source_text or ""}
        )
        
        result_data = None
        async for event in orchestrator.handle(context):
            if event.type == StreamEventType.RESULT:
                result_data = event.metadata

        if result_data:
            await store.update_deck(deck_id, {
                "status": "completed",
                "slides_count": result_data.get("slides_count", 0),
                "file_url": result_data.get("file_url", "")
            })
        else:
            await store.update_deck(deck_id, {"status": "failed"})
            
    except Exception as e:
        logger.exception("Background deck generation failed")
        store = get_sqlite_deck_store()
        await store.update_deck(deck_id, {"status": "failed"})
