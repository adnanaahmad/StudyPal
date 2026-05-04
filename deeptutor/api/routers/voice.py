"""
Voice agent management API.
"""

from __future__ import annotations

import logging
import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from deeptutor.services.tutorbot import get_tutorbot_manager
from deeptutor.config.settings import settings
from deeptutor.logging import get_logger

logger = get_logger("VoiceAPI")
router = APIRouter()

class VoiceTokenResponse(BaseModel):
    token: str
    livekit_url: str
    room_name: str
    expires_in: int

@router.post("/token", response_model=VoiceTokenResponse)
async def get_voice_token(bot_id: str | None = Query(None)):
    """
    Obtain a voice token for a specific bot or a general agent session.
    """
    mgr = get_tutorbot_manager()
    
    # If bot_id is provided, verify it's running
    if bot_id:
        instance = mgr.get_bot(bot_id)
        if instance is None:
            logger.info(f"Bot '{bot_id}' not found or not running")
            cfg = mgr._load_bot_config(bot_id)
            if cfg is None:
                raise HTTPException(status_code=404, detail="Bot not found")
            raise HTTPException(status_code=409, detail=f"Bot '{bot_id}' is not running")
        
        bot_name = instance.config.name
        logger.info(f"Requesting voice token for bot '{bot_id}' (name: '{bot_name}')")
    else:
        # Fallback to default agent if no bot_id specified
        logger.info("Requesting voice token for general agent session")

    async with httpx.AsyncClient() as client:
        try:
            headers = {
                "X-API-Key": settings.vocal_bridge_api_key,
                "Content-Type": "application/json",
            }
            if settings.vocal_bridge_agent_id:
                headers["X-Agent-Id"] = settings.vocal_bridge_agent_id

            resp = await client.post(
                "https://vocalbridgeai.com/api/v1/token",
                headers=headers,
                json={"participant_name": "User"},
                timeout=10.0,
            )
            resp.raise_for_status()
            data = resp.json()
            
            logger.info(f"Successfully obtained voice token. Room: {data.get('room_name')}")
        except httpx.HTTPStatusError as exc:
            logger.error(f"VocalBridge API error: {exc.response.status_code} - {exc.response.text}")
            raise HTTPException(status_code=exc.response.status_code, detail=f"VocalBridge error: {exc.response.text}")
        except Exception as exc:
            logger.error(f"Failed to get voice token: {str(exc)}")
            raise HTTPException(status_code=500, detail="Failed to reach voice provider")

    return {
        "token": data["token"],
        "livekit_url": data["livekit_url"],
        "room_name": data["room_name"],
        "expires_in": data.get("expires_in", 3600),
    }
