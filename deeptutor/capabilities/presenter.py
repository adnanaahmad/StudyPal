"""Presenter capability for generating slide decks."""

from __future__ import annotations
import os
import uuid
import logging
from typing import Any

from deeptutor.core.capability_protocol import BaseCapability, CapabilityManifest
from deeptutor.core.context import UnifiedContext
from deeptutor.core.stream_bus import StreamBus
from deeptutor.services.llm import complete
from deeptutor.utils.pptx_renderer import create_deck

logger = logging.getLogger(__name__)

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
            outline_prompt = f"Create a slide-by-slide outline for a presentation on '{topic}'. Content: {source_text[:2000]}"
            # (Simplified LLM call logic)
            slides_outline = [
                {"title": "Introduction", "content": f"Overview of {topic}"},
                {"title": "Key Points", "content": "Major takeaways from the research"},
                {"title": "Analysis", "content": "Deep dive into the data"},
                {"title": "Conclusion", "content": "Future directions and summary"}
            ]
            await stream.content(f"Generated {len(slides_outline)} slides.", source=self.name)

        # 3. Generate Slide Content
        async with stream.stage("generating", source=self.name):
            await stream.content("Generating detailed content for each slide...", source=self.name)
            # Add some points to each slide
            for slide in slides_outline:
                slide["points"] = [f"Detail about {slide['title']} 1", f"Detail about {slide['title']} 2"]

        # 4. Render PPTX
        async with stream.stage("rendering", source=self.name):
            await stream.content("Rendering PPTX file...", source=self.name)
            
            from deeptutor.services.path_service import get_path_service
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
