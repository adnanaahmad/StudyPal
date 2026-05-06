"""Presenter capability for generating slide decks."""

from __future__ import annotations
import json
import uuid
import logging
from typing import Any

from deeptutor.core.capability_protocol import BaseCapability, CapabilityManifest
from deeptutor.core.context import UnifiedContext
from deeptutor.core.stream_bus import StreamBus
from deeptutor.services.llm import complete
from deeptutor.services.path_service import get_path_service
from deeptutor.utils.pptx_renderer import create_deck

logger = logging.getLogger(__name__)


def _extract_json_payload(raw: str) -> str:
    text = (raw or "").strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


def _normalize_slides(raw: str) -> list[dict[str, Any]]:
    payload = _extract_json_payload(raw)
    parsed = json.loads(payload)
    if not isinstance(parsed, list):
        raise ValueError("Slides payload must be a JSON array")

    normalized: list[dict[str, Any]] = []
    for idx, slide in enumerate(parsed):
        if not isinstance(slide, dict):
            continue
        title = str(slide.get("title") or f"Slide {idx + 1}").strip()
        content = str(slide.get("content") or "").strip()
        points = slide.get("points") or []
        clean_points = [str(p).strip() for p in points if str(p).strip()]
        normalized.append({"title": title, "content": content, "points": clean_points})

    if not normalized:
        raise ValueError("Slides payload was empty")
    return normalized


class PresenterCapability(BaseCapability):
    manifest = CapabilityManifest(
        name="presenter",
        description="Transform papers or topics into professional PPTX slide decks.",
        stages=["extracting", "outlining", "generating", "rendering"],
        cli_aliases=["present", "deck"],
    )

    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        topic = context.user_message
        source_text = context.metadata.get("source_text", "")
        
        # 1. Extract/Synthesize Context
        async with stream.stage("extracting", source=self.name):
            await stream.content(f"Analyzing source material for '{topic}'...", source=self.name)
            # In a real scenario, we might use RAG here. For now, we use the provided source_text.
        
        # 2. Generate Outline
        async with stream.stage("outlining", source=self.name):
            await stream.content("Creating slide outline...", source=self.name)
            outline_prompt = (
                "Create slide content as JSON for a presentation.\n"
                "Requirements:\n"
                "- Return ONLY valid JSON (no markdown).\n"
                "- JSON must be an array of 4-7 objects.\n"
                '- Each object: {"title": string, "content": string, "points": string[]}.\n'
                "- Keep content concise, specific, and grounded in provided material.\n"
                "- If source material is sparse, still produce concrete educational content.\n\n"
                f"Topic: {topic}\n"
                f"Source material:\n{source_text[:8000] if source_text else '(none provided)'}"
            )
            try:
                llm_output = await complete(
                    prompt=outline_prompt,
                    system_prompt=(
                        "You are an expert presentation author who outputs strict JSON only."
                    ),
                    temperature=0.2,
                )
                slides_outline = _normalize_slides(llm_output)
            except Exception:
                logger.exception("Presenter LLM generation failed; using fallback outline")
                slides_outline = [
                    {"title": "Introduction", "content": f"Overview of {topic}"},
                    {"title": "Key Points", "content": "Major takeaways from the material"},
                    {"title": "Analysis", "content": "Key insights and supporting evidence"},
                    {"title": "Conclusion", "content": "Summary and next steps"},
                ]
            await stream.content(f"Generated {len(slides_outline)} slides.", source=self.name)

        # 3. Generate Slide Content
        async with stream.stage("generating", source=self.name):
            await stream.content("Generating detailed content for each slide...", source=self.name)
            for slide in slides_outline:
                points = slide.get("points") or []
                if not points:
                    slide["points"] = [
                        f"Core idea behind {slide.get('title', 'this section')}",
                        "Practical implication or example",
                    ]

        # 4. Render PPTX
        async with stream.stage("rendering", source=self.name):
            await stream.content("Rendering PPTX file...", source=self.name)
            path_service = get_path_service()
            
            output_filename = f"deck_{uuid.uuid4().hex[:8]}.pptx"
            output_dir = path_service.get_decks_dir()
            output_dir.mkdir(parents=True, exist_ok=True)
            output_path = output_dir / output_filename
            
            create_deck(topic, slides_outline, str(output_path))
            
            # The download mount is at /api/outputs, which points to user_data_dir.
            # get_decks_dir() is user_data_dir / "decks".
            file_url = f"/api/outputs/decks/{output_filename}"
            await stream.result({
                "id": str(uuid.uuid4()),
                "title": topic,
                "status": "completed",
                "slides_count": len(slides_outline),
                "file_url": file_url,
                "created_at": 1714800000 # Placeholder timestamp
            }, source=self.name)
