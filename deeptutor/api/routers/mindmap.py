"""Mindmap generation and session persistence router."""

from __future__ import annotations

import logging
import re

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from deeptutor.services.llm import get_llm_client
from deeptutor.services.session.sqlite_store import get_sqlite_session_store

logger = logging.getLogger(__name__)
router = APIRouter()

SYSTEM_PROMPT = """\
You are a mindmap generation assistant. Given a topic description or document text,
produce a hierarchical Markdown outline that is **directly compatible with Markmap**.

RULES:
1. Start with a single `# Title` as the central node.
2. Use `##` for main branches, `###` for sub-branches, `-` for leaf items.
3. Keep every node label concise (max 5 words).
4. Output ONLY the raw Markdown — no code fences, no prose, no explanations.
5. Aim for 3–5 main branches with 2–4 children each.
6. If modifying an existing map (supplied as "Current Map"), return the FULL updated Markdown.

EXAMPLE OUTPUT:
# Photosynthesis
## Light Reactions
### Chlorophyll absorbs light
### Water split → O₂
## Calvin Cycle
### CO₂ fixation
### Glucose produced
## Requirements
- Sunlight
- Water
- CO₂
"""


# ---------------------------------------------------------------------------
# Session persistence
# ---------------------------------------------------------------------------


class MarkdownPayload(BaseModel):
    markdown: str


@router.get("/session/{session_id}")
async def get_mindmap_session(session_id: str):
    store = get_sqlite_session_store()
    session = await store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    prefs = session.get("preferences", {}) or {}
    return {"markdown": prefs.get("mindmap_markdown", "")}


@router.put("/session/{session_id}")
async def save_mindmap_session(session_id: str, payload: MarkdownPayload):
    store = get_sqlite_session_store()
    ok = await store.update_session_preferences(
        session_id, {"mindmap_markdown": payload.markdown}
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------


class GenerateRequest(BaseModel):
    prompt: str
    file_content: str | None = None  # plaintext from TXT/PDF, extracted on frontend
    current_markdown: str = ""
    session_id: str | None = None


class GenerateResponse(BaseModel):
    markdown: str
    message: str
    session_id: str


@router.post("/generate")
async def generate_mindmap(request: GenerateRequest) -> GenerateResponse:
    store = get_sqlite_session_store()

    # Resolve / create session
    session = await store.ensure_session(request.session_id, session_type="mindmap")
    session_id = session["id"]

    # Build user message
    parts: list[str] = []

    if request.file_content:
        parts.append(
            f"Document content:\n{request.file_content[:12_000]}"  # cap to avoid overloading context
        )

    parts.append(f"User request: {request.prompt}")

    if request.current_markdown:
        parts.append(
            f"Current Map (modify or expand this):\n{request.current_markdown}"
        )

    user_message = "\n\n".join(parts)

    client = get_llm_client()
    raw = await client.complete(
        prompt=user_message,
        system_prompt=SYSTEM_PROMPT,
        max_tokens=1024,
    )

    markdown = _clean_markdown(raw)

    # Auto-save to session
    await store.update_session_preferences(
        session_id, {"mindmap_markdown": markdown}
    )

    return GenerateResponse(
        markdown=markdown,
        message="Mindmap generated.",
        session_id=session_id,
    )


def _clean_markdown(raw: str) -> str:
    """Strip code fences and leading/trailing whitespace from LLM output."""
    text = raw.strip()
    # Remove ``` fences the LLM might add despite instructions
    text = re.sub(r"^```[a-z]*\n?", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\n?```$", "", text)
    return text.strip()
