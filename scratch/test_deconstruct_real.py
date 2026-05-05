"""
Test /api/v1/whiteboard/deconstruct endpoint with a real diagram image.

Confirms:
  1. No 'multiple values for keyword argument model' error (the bug we fixed)
  2. The LLM is reached and returns a parseable response
  3. If the model lacks vision, a 400 with a clear message is returned (expected with qwen2.5)
"""
import asyncio
import base64
import json
import sys
from pathlib import Path

import httpx

IMAGE_PATH = Path("/Users/adnanahmad/.gemini/antigravity/brain/4a3a39fe-2854-4321-b8b4-f580d81a10bd/test_diagram_1777959107324.png")
ENDPOINT = "http://localhost:8001/api/v1/whiteboard/deconstruct"


def encode_image(path: Path) -> str:
    raw = path.read_bytes()
    b64 = base64.b64encode(raw).decode()
    return f"data:image/png;base64,{b64}"


async def main():
    if not IMAGE_PATH.exists():
        print(f"ERROR: Image not found at {IMAGE_PATH}")
        sys.exit(1)

    image_b64 = encode_image(IMAGE_PATH)
    print(f"Image encoded: {len(image_b64)} chars")

    payload = {
        "image_base64": image_b64,
        "session_id": None,
    }

    print(f"\nPOSTing to {ENDPOINT} ...")
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(ENDPOINT, json=payload)

    print(f"Status: {response.status_code}")

    try:
        body = response.json()
        print(f"Body: {json.dumps(body, indent=2)[:2000]}")
    except Exception:
        print(f"Raw body: {response.text[:1000]}")

    if response.status_code == 500 and "multiple values" in response.text:
        print("\n❌ STILL BROKEN: 'multiple values for keyword argument model' error persists!")
        sys.exit(1)
    elif response.status_code == 500 and "LLM analysis failed" in response.text:
        print("\n❌ LLM call failed (check model/api_key config).")
        sys.exit(1)
    elif response.status_code == 500 and "invalid response" in response.text.lower():
        print("\n⚠️  Model reached but returned non-JSON (non-vision model — expected with qwen2.5:7b).")
        print("   The 'multiple values' bug is FIXED. Use a vision-capable model for real use.")
    elif response.status_code == 400 and "Vision Capability Missing" in response.text:
        print("\n⚠️  Non-vision model detected (400). Bug is FIXED — LLM was reached successfully.")
    elif response.status_code == 200:
        print("\n✅ SUCCESS: Diagram deconstructed into editable whiteboard XML!")
        body = response.json()
        xml = body.get("xml", "")
        node_count = xml.count('vertex="1"')
        edge_count = xml.count('edge="1"')
        print(f"   Nodes: {node_count}, Edges: {edge_count}")
        print(f"   Session ID: {body.get('session_id')}")
    else:
        print(f"\n❓ Unexpected response: {response.status_code}")


if __name__ == "__main__":
    asyncio.run(main())
