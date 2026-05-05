"""Diagram analysis tool for converting images to editable diagrams."""

import logging
from typing import Any, Optional

from deeptutor.core.tool_protocol import BaseTool, ToolDefinition, ToolParameter, ToolResult
from deeptutor.services.llm import complete
from deeptutor.services.llm.config import get_llm_config

logger = logging.getLogger(__name__)

class DiagramAnalysisTool(BaseTool):
    """Analyze a diagram image and generate editable Draw.io XML."""

    _SYSTEM_PROMPT = """You are a professional diagram architecture assistant and vision analyst.
Analyze the provided image of a diagram (flowchart, ERD, architecture, roadmap, etc.) and generate a valid Draw.io XML structure that represents it.

DECONSTRUCTION RULES:
1. Capture EVERY visible element in the image. For ER diagrams, EVERY table and its primary name must be included.
2. Maintain the visual layout. Ensure positions (x, y) and dimensions roughly match the visual layout.
3. Include text labels and connecting arrows exactly as seen. Do not simplify.
4. Output ONLY valid Draw.io XML. No markdown fences, no explanation.
5. Use standard styles (rounded=1 for rectangles, cylinder for databases).
"""

    def get_definition(self) -> ToolDefinition:
        return ToolDefinition(
            name="diagram_analysis",
            description=(
                "Analyze an image of a diagram, flowchart, or technical roadmap "
                "and generate editable Draw.io XML for the whiteboard. "
                "Requires an attached image."
            ),
            parameters=[
                ToolParameter(
                    name="image_base64",
                    type="string",
                    description="Base64-encoded image of the diagram.",
                    required=True,
                ),
                ToolParameter(
                    name="description",
                    type="string",
                    description="Optional description or context of what to focus on.",
                    required=False,
                ),
            ],
        )

    async def execute(self, **kwargs: Any) -> ToolResult:
        image_base64 = kwargs.get("image_base64", "")
        description = kwargs.get("description", "")

        if not image_base64:
            return ToolResult(
                content="No image provided. Please attach a diagram image.",
                success=False,
            )

        llm_config = get_llm_config()
        
        try:
            # We use the vision-capable model
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": f"Diagram description/context: {description}\n\nGenerate the Draw.io XML."},
                        {"type": "image_url", "image_url": {"url": image_base64}},
                    ],
                }
            ]
            
            response = await complete(
                prompt="",
                system_prompt=self._SYSTEM_PROMPT,
                model=llm_config.model,
                api_key=llm_config.api_key,
                base_url=llm_config.base_url,
                messages=messages,
            )
            
            xml_content = self._strip_xml(response)
            
            return ToolResult(
                content=xml_content,
                metadata={
                    "type": "drawio_xml",
                    "description": description
                }
            )
        except Exception as e:
            logger.exception("Diagram analysis failed")
            return ToolResult(content=f"Error analyzing diagram: {str(e)}", success=False)

    def _strip_xml(self, text: str) -> str:
        text = text.strip()
        if text.startswith("```xml"):
            text = text[6:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip()
