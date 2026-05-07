import json
import logging
import math
import re
import xml.etree.ElementTree as ET
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from deeptutor.services.llm import get_llm_client
from deeptutor.services.session.sqlite_store import get_sqlite_session_store
from deeptutor.services.config import get_env_store

logger = logging.getLogger(__name__)
router = APIRouter()


SYSTEM_PROMPT = """You are a professional diagram architecture assistant and vision analyst.
Your goal is to analyze diagrams (flowcharts, ERDs, system architectures) and represent them as a logical graph of nodes and edges in JSON format.

JSON SCHEMA:
{
  "nodes": [
    {"id": "unique_id", "label": "Node Name", "type": "rectangle|ellipse|cloud|database"}
  ],
  "edges": [
    {"source": "source_id", "target": "target_id", "label": "Optional Label"}
  ]
}

DECONSTRUCTION RULES:
1. Capture EVERY visible element in the image. For ER diagrams, EVERY table and its primary name must be a node.
2. Maintain the visual relationships. If A points to B in the image, create an edge from A to B.
3. Be EXTREMELY precise with labels. Do not simplify "User Authentication Service" to "Auth".
4. If the diagram is an ERD, use the 'database' type for tables.

MODIFICATION RULES:
1. If you receive a "Current Graph State", you MUST use it as your base context.
2. Return the ENTIRE updated graph, not just the changes.
3. Keep IDs consistent with the current state.

GENERIC RULES:
1. Output valid JSON. You may wrap it in a ```json ... ``` code block if needed.
2. Ensure every edge source and target exactly matches a node id.
3. Default node type is 'rectangle'.
"""


class WhiteboardXmlPayload(BaseModel):
    xml: str


@router.get("/session/{session_id}")
async def get_whiteboard_session(session_id: str):
    store = get_sqlite_session_store()
    session = await store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    prefs = session.get("preferences", {}) or {}
    return {"xml": prefs.get("whiteboard_xml", "")}


@router.put("/session/{session_id}")
async def save_whiteboard_session(session_id: str, payload: WhiteboardXmlPayload):
    store = get_sqlite_session_store()
    ok = await store.update_session_preferences(session_id, {"whiteboard_xml": payload.xml})
    if not ok:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


class GenerateRequest(BaseModel):
    prompt: str
    current_xml: str = ""
    session_id: str | None = None


class DeconstructRequest(BaseModel):
    image_base64: str
    session_id: str | None = None


class GenerateResponse(BaseModel):
    xml: str
    message: str
    session_id: str


class NodeDef(BaseModel):
    id: str
    label: str
    type: str = "rectangle"


class EdgeDef(BaseModel):
    source: str
    target: str
    label: str = ""


class LogicalGraph(BaseModel):
    nodes: list[NodeDef]
    edges: list[EdgeDef]


@router.post("/generate")
async def generate_diagram(request: GenerateRequest) -> GenerateResponse:
    store = get_sqlite_session_store()
    
    # Resolve valid session (create one if missing)
    session = await store.ensure_session(request.session_id, session_type="whiteboard")
    session_id = session["id"]
    
    # 1. Load context if current_xml is missing
    current_xml = request.current_xml
    if not current_xml:
        current_xml = session.get("preferences", {}).get("whiteboard_xml", "")

    user_message = request.prompt
    if current_xml:
        try:
            current_graph = _parse_xml_to_graph(current_xml)
            if current_graph.nodes:
                context_json = current_graph.model_dump_json(indent=2)
                user_message = f"{request.prompt}\n\nCurrent Graph State (JSON):\n{context_json}"
        except Exception as e:
            logger.warning(f"Failed to parse context XML to graph: {e}")
            # Fallback to the truncated XML summary if parsing fails
            user_message = f"{request.prompt}\n\nCurrent logical structure summary (ignore coordinates, focus on entities): {current_xml[:500]}..."

    client = get_llm_client()
    # Use larger token limit for JSON, though it's more compact
    raw = await client.complete(prompt=user_message, system_prompt=SYSTEM_PROMPT, max_tokens=4096)

    # Clean up and repair JSON
    json_text = raw.strip()
    # Extract JSON robustly from fenced blocks or mixed reasoning/text responses.
    code_block_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", json_text, re.DOTALL | re.IGNORECASE)
    if code_block_match:
        json_text = code_block_match.group(1).strip()
    elif not json_text.startswith("{"):
        bare_match = re.search(r"(\{.*\})", json_text, re.DOTALL)
        if bare_match:
            json_text = bare_match.group(1).strip()

    try:
        from json_repair import repair_json
        repaired = repair_json(json_text)
        data = json.loads(repaired)
        graph = LogicalGraph.model_validate(data)
    except Exception as e:
        logger.error(f"Failed to parse logic graph: {e}\nRaw: {raw}")
        # Final fallback: if it's really broken, we can't do much, but at least we tried
        raise HTTPException(status_code=500, detail="Failed to generate logical graph structure")

    xml = _generate_mxgraph_xml(graph)
    
    # 2. Automatically persist the generated XML
    await store.update_session_preferences(session_id, {"whiteboard_xml": xml})

    return GenerateResponse(xml=xml, message="Diagram generated.", session_id=session_id)


@router.post("/deconstruct")
async def deconstruct_diagram(request: DeconstructRequest) -> GenerateResponse:
    from deeptutor.services.llm import complete
    from deeptutor.services.llm.config import get_llm_config

    store = get_sqlite_session_store()
    session = await store.ensure_session(request.session_id, session_type="whiteboard")
    session_id = session["id"]

    system_prompt = SYSTEM_PROMPT + "\n\nTask: Analyze the provided image of a diagram (e.g. ERD, flowchart, architecture) and extract EVERY node and connection into the JSON format. Do not simplify; capture the full complexity of the diagram including table names, field names (if possible), and all relational arrows."

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Convert this diagram image to the logical JSON format."},
                {"type": "image_url", "image_url": {"url": request.image_base64}},
            ],
        }
    ]

    # Vision model priority (reads .env directly via get_env_store):
    #   1. VISION_MODEL — local ollama vision model (e.g. gemma4:2b, llava)
    #   2. NVIDIA_MODEL_NEMO_OMNI + NVIDIA_API_KEY — cloud vision via NVIDIA API
    #   3. Default LLM_MODEL (fallback, likely non-vision)
    env = get_env_store()
    local_vision_model = env.get("VISION_MODEL")
    nvidia_model = env.get("NVIDIA_MODEL_NEMO_OMNI")
    nvidia_key = env.get("NVIDIA_API_KEY")

    # Build factory.complete kwargs directly — avoids the LLMClient double-injection
    # bug where client.complete() always passes model=self.config.model AND the caller
    # passes model=... in **kwargs, causing "multiple values for keyword argument 'model'".
    if local_vision_model:
        # Use local ollama vision model (same host/binding as main LLM)
        cfg = get_llm_config()
        logger.info(f"Using local vision model: {local_vision_model}")
        complete_kwargs: dict[str, Any] = {
            "prompt": "",
            "system_prompt": system_prompt,
            "messages": messages,
            "max_tokens": 8192,
            "model": local_vision_model,
            "api_key": cfg.api_key,
            "base_url": cfg.base_url,
            "binding": getattr(cfg, "binding", "openai"),
        }
    elif nvidia_model and nvidia_key:
        # Nemotron is a reasoning model — needs high max_tokens to complete CoT + output
        logger.info(f"Using NVIDIA vision model: {nvidia_model}")
        complete_kwargs = {
            "prompt": "",
            "system_prompt": system_prompt,
            "messages": messages,
            "max_tokens": 16384,
            "model": nvidia_model,
            "api_key": nvidia_key,
            "binding": "nvidia",
            "base_url": "https://integrate.api.nvidia.com/v1",
        }
    else:
        # Use the default configured model (reads from .env via get_llm_config)
        cfg = get_llm_config()
        complete_kwargs = {
            "prompt": "",
            "system_prompt": system_prompt,
            "messages": messages,
            "max_tokens": 4096,
            "model": cfg.model,
            "api_key": cfg.api_key,
            "base_url": cfg.base_url,
            "binding": getattr(cfg, "binding", "openai"),
        }


    try:
        raw = await complete(**complete_kwargs)
    except Exception as e:
        logger.error(f"LLM call failed for deconstruction: {e}")
        raise HTTPException(status_code=500, detail=f"LLM analysis failed: {str(e)}")

    # JSON repair and validation (reuse logic from generate_diagram)
    json_text = raw.strip()
    logger.debug(f"Raw vision response: {json_text}")

    # Empty response = model received the image but cannot process it (non-vision model).
    # Ollama silently returns "" instead of an error for text-only models like qwen2.5.
    if not json_text:
        raise HTTPException(
            status_code=400,
            detail=(
                "Vision Capability Missing: The current AI model returned an empty response. "
                "It likely cannot process images. Switch to a vision-capable model such as "
                "'llava', 'llava-phi3', or 'gpt-4o' in your .env file (LLM_MODEL setting)."
            ),
        )

    # Search anywhere in the response for a ```json``` block or bare JSON object.
    # Reasoning models (e.g. Nemotron) often prefix the JSON with thinking text.
    code_block_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", json_text, re.DOTALL | re.IGNORECASE)
    if code_block_match:
        json_text = code_block_match.group(1).strip()
    elif not json_text.startswith("{"):
        bare_match = re.search(r"(\{.*\})", json_text, re.DOTALL)
        if bare_match:
            json_text = bare_match.group(1).strip()

    try:
        from json_repair import repair_json
        repaired = repair_json(json_text)
        data = json.loads(repaired)
        graph = LogicalGraph.model_validate(data)
    except Exception as e:
        logger.error(f"Failed to parse logic graph from vision: {e}\nRaw: {raw}")
        # Check if the response looks like a conversational refusal (typical of non-vision models)
        if any(keyword in raw.lower() for keyword in ["describe", "not see", "cannot analyze", "provide details"]):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Vision Capability Missing: Your current AI model cannot 'see' images. "
                    "Switch to a vision-capable model like 'llava' or 'gpt-4o' in your .env file."
                ),
            )
        raise HTTPException(status_code=500, detail="The AI returned an invalid response. Please try a clearer image.")

    xml = _generate_mxgraph_xml(graph)
    await store.update_session_preferences(session_id, {"whiteboard_xml": xml})

    return GenerateResponse(xml=xml, message="Diagram deconstructed.", session_id=session_id)


def _generate_mxgraph_xml(graph: LogicalGraph) -> str:
    """Convert logical graph into mxGraph XML with automatic circular layout to prevent overlap."""
    # Settings
    node_w, node_h = 140, 70
    
    num_nodes = len(graph.nodes)
    if num_nodes == 0:
        return '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'

    # Semantic Architecture Layout (Heuristic Tiering)
    level_nodes = {0: [], 1: [], 2: [], 3: []}
    node_levels = {}
    
    for node in graph.nodes:
        lbl = node.label.lower()
        typ = node.type.lower()
        
        assigned_level = 1
        if "gateway" in lbl or "client" in lbl or "frontend" in lbl or "ui" in lbl or "user" == lbl:
            assigned_level = 0
        elif "db" in lbl or "database" in lbl or "store" in lbl or "cache" in lbl or "db" in typ or "database" in typ:
            assigned_level = 2
        elif "saga" in lbl or "coordinator" in lbl or "broker" in lbl or "queue" in lbl or "kafka" in lbl or "event" in lbl:
            assigned_level = 3
            
        level_nodes[assigned_level].append(node)
        node_levels[node.id] = assigned_level

    # Remove empty levels and sort them conceptually
    active_levels = [lvl for lvl in [0, 1, 2, 3] if level_nodes[lvl]]
    
    h_gap, v_gap = 140, 180
    start_y = 100
    
    # ID mapping (LLM IDs to internal numeric strings for safety)
    id_map: dict[str, str] = {}
    next_id = 2

    # Vertex style mapping
    styles = {
        "rectangle": "rounded=1;whiteSpace=wrap;html=1;",
        "ellipse": "ellipse;whiteSpace=wrap;html=1;",
        "cloud": "ellipse;shape=cloud;whiteSpace=wrap;html=1;",
        "database": "shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;",
    }

    cells = [
        '<mxCell id="0"/>',
        '<mxCell id="1" parent="0"/>'
    ]

    for level in active_levels:
        nodes = level_nodes[level]
        
        # If a tier has many nodes, break it into sub-rows of max 5 columns
        max_cols = 5
        sub_rows = [nodes[i:i + max_cols] for i in range(0, len(nodes), max_cols)]
        
        for sub_nodes in sub_rows:
            # Center the row horizontally assuming a virtual canvas width of ~1200
            total_width = len(sub_nodes) * node_w + (len(sub_nodes) - 1) * h_gap
            current_x = max(100, (1200 - total_width) / 2)
            
            for i, node in enumerate(sub_nodes):
                # Vertical jitter prevents horizontal edges within the same tier from slicing through nodes
                y_jitter = 40 if i % 2 == 1 else 0
                
                x = current_x
                y = start_y + y_jitter
                current_x += node_w + h_gap
                
                internal_id = str(next_id)
                id_map[node.id] = internal_id
                next_id += 1
            
                # Fuzzy match style
                ntype = node.type.lower()
                nlabel = node.label.lower()
                if "cloud" in ntype or "cloud" in nlabel:
                    style = styles["cloud"]
                elif "db" in ntype or "database" in ntype or "cylinder" in ntype or "db" in nlabel or "database" in nlabel:
                    style = styles["database"]
                elif "ellipse" in ntype or "circle" in ntype or "user" in nlabel or "actor" in nlabel:
                    style = styles["ellipse"]
                else:
                    style = styles["rectangle"]
                value = _escape_xml(node.label)
                
                cells.append(
                    f'<mxCell id="{internal_id}" value="{value}" style="{style}" vertex="1" parent="1">'
                    f'<mxGeometry x="{x}" y="{y}" width="{node_w}" height="{node_h}" as="geometry"/>'
                    '</mxCell>'
                )
            
            # Advance Y position for the next sub-row or tier
            start_y += node_h + v_gap

    for edge in graph.edges:
        source_id = id_map.get(edge.source)
        target_id = id_map.get(edge.target)
        if not source_id or not target_id:
            continue
            
        edge_id = str(next_id)
        next_id += 1
        value = _escape_xml(edge.label)
        
        # Determine port routing based on tier difference
        src_level = node_levels.get(edge.source, 1)
        tgt_level = node_levels.get(edge.target, 1)
        
        port_style = ""
        if src_level < tgt_level:
            # Flowing down: exit bottom, enter top
            port_style = "exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;"
        elif src_level > tgt_level:
            # Flowing up: exit top, enter bottom
            port_style = "exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0.5;entryY=1;entryDx=0;entryDy=0;"
        
        # Add labelBackgroundColor to prevent the line from crossing out the text
        # Use rounded=1 for smoother routing
        cells.append(
            f'<mxCell id="{edge_id}" value="{value}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;labelBackgroundColor=#ffffff;{port_style}" edge="1" parent="1" source="{source_id}" target="{target_id}">'
            f'<mxGeometry relative="1" as="geometry"/>'
            '</mxCell>'
        )

    return f'<mxGraphModel><root>{"".join(cells)}</root></mxGraphModel>'


def _escape_xml(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&apos;")


def _parse_xml_to_graph(xml_str: str) -> LogicalGraph:
    """Parse mxGraph XML back into a LogicalGraph (JSON blueprint)."""
    try:
        # Basic cleanup for common XML issues
        xml_str = xml_str.strip()
        if not xml_str:
            return LogicalGraph(nodes=[], edges=[])
            
        root = ET.fromstring(xml_str)
        cells = root.findall(".//mxCell")
        
        nodes: list[NodeDef] = []
        edges: list[EdgeDef] = []
        
        # We need a map to track which mxCell is a vertex
        vertex_ids = set()
        
        for cell in cells:
            cell_id = cell.get("id")
            if not cell_id or cell_id in ("0", "1"):
                continue
            
            is_vertex = cell.get("vertex") == "1"
            is_edge = cell.get("edge") == "1"
            
            if is_vertex:
                label = cell.get("value", "")
                style = cell.get("style", "").lower()
                
                # Reverse style mapping
                ntype = "rectangle"
                if "cloud" in style:
                    ntype = "cloud"
                elif "cylinder" in style:
                    ntype = "database"
                elif "ellipse" in style:
                    ntype = "ellipse"
                
                nodes.append(NodeDef(id=cell_id, label=label, type=ntype))
                vertex_ids.add(cell_id)
                
            elif is_edge:
                source = cell.get("source")
                target = cell.get("target")
                label = cell.get("value", "")
                
                if source and target:
                    edges.append(EdgeDef(source=source, target=target, label=label))
        
        return LogicalGraph(nodes=nodes, edges=edges)
    except Exception as e:
        logger.error(f"Error parsing mxGraph XML: {e}")
        return LogicalGraph(nodes=[], edges=[])
