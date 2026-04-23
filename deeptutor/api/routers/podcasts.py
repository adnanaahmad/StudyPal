"""API Router for Podcasts Hub"""

import asyncio
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from deeptutor.services.session.sqlite_podcast_store import get_sqlite_podcast_store
from deeptutor.services.podcast_generator import get_podcast_generator

router = APIRouter()

class GeneratePodcastRequest(BaseModel):
    title: str
    topic: str
    file_content: str | None = None

class PodcastResponse(BaseModel):
    id: str
    title: str
    duration: float
    status: str
    created_at: float

@router.get("", response_model=list[PodcastResponse])
async def list_podcasts(limit: int = 50, offset: int = 0):
    store = get_sqlite_podcast_store()
    podcasts = await store.list_podcasts(limit, offset)
    return podcasts

@router.post("/generate")
async def generate_podcast(req: GeneratePodcastRequest, background_tasks: BackgroundTasks):
    store = get_sqlite_podcast_store()
    podcast = await store.create_podcast(req.title)
    
    generator = get_podcast_generator()
    background_tasks.add_task(
        generator.generate_podcast,
        podcast_id=podcast["id"],
        topic=req.topic,
        file_content=req.file_content
    )
    
    return {"id": podcast["id"], "status": "generating"}

@router.get("/{podcast_id}")
async def get_podcast(podcast_id: str):
    store = get_sqlite_podcast_store()
    podcast = await store.get_podcast(podcast_id)
    if not podcast:
        raise HTTPException(status_code=404, detail="Podcast not found")
    return podcast
