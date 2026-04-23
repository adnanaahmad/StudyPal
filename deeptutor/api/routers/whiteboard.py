import json
import logging
import math
import re
import xml.etree.ElementTree as ET
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from deeptutor.services.llm import get_llm_client
from deeptutor.services.session.sqlite_store import get_sqlite_session_store

logger = logging.getLogger(__name__)
router = APIRouter()


SYSTEM_PROMPT = """You are a diagram architecture assistant.
Your goal is to provide a logical graph of nodes and edges in JSON format.
I will convert this JSON to a draw.io diagram for you.

JSON SCHEMA:
{
  "nodes": [
    {"id": "unique_id", "label": "Node Name", "type": "rectangle|ellipse|cloud|database"}
  ],
  "edges": [
    {"source": "source_id", "target": "target_id", "label": "Optional Label"}
  ]
}

MODIFICATION RULES:
1. If you receive a "Current Graph State", you MUST use it as your base context.
2. If the user asks for a modification, return the ENTIRE updated graph, not just the changes.
3. Keep IDs consistent with the current state unless deleting/replacing a node.

GENERIC RULES:
1. Output ONLY the valid JSON object. No prose, no markdown fences.
2. Ensure every edge source and target exactly matches a node id.
3. Use descriptive but concise labels.
4. Default node type is 'rectangle'.
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
    session = await store.ensure_session(request.session_id)
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
    raw = await client.complete(prompt=user_message, system_prompt=SYSTEM_PROMPT, max_tokens=2048)

    # Clean up and repair JSON
    json_text = raw.strip()
    if json_text.startswith("```"):
        match = re.search(r"```(?:json)?\s*(\{.*?\})", json_text, re.DOTALL | re.IGNORECASE)
        if match:
            json_text = match.group(1).strip()

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


def _generate_mxgraph_xml(graph: LogicalGraph) -> str:
    """Convert logical graph into mxGraph XML with automatic grid layout."""
    # Settings
    node_w, node_h = 140, 70
    h_gap, v_gap = 100, 150
    start_x, start_y = 100, 100

    num_nodes = len(graph.nodes)
    if num_nodes == 0:
        return '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'

    cols = math.ceil(math.sqrt(num_nodes))
    
    # ID mapping (LLM IDs to internal numeric strings for safety)
    id_map: dict[str, str] = {}
    next_id = 2

    # Vertex style mapping
    styles = {
        "rectangle": "rounded=1;whiteSpace=wrap;html=1;",
        "ellipse": "ellipse;whiteSpace=wrap;html=1;",
        "cloud": "ellipse;shape=cloud;whiteSpace=wrap;html=1;",
        "database": "shape=cylinder;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;",
    }

    cells = [
        '<mxCell id="0"/>',
        '<mxCell id="1" parent="0"/>'
    ]

    for i, node in enumerate(graph.nodes):
        row = i // cols
        col = i % cols
        x = start_x + (col * (node_w + h_gap))
        y = start_y + (row * (node_h + v_gap))
        
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

    for edge in graph.edges:
        source_id = id_map.get(edge.source)
        target_id = id_map.get(edge.target)
        if not source_id or not target_id:
            continue
            
        edge_id = str(next_id)
        next_id += 1
        value = _escape_xml(edge.label)
        
        cells.append(
            f'<mxCell id="{edge_id}" value="{value}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;" edge="1" parent="1" source="{source_id}" target="{target_id}">'
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
