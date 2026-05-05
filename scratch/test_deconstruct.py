import asyncio
import base64
import json
import httpx

# Tiny 1x1 red pixel PNG in base64
TINY_PNG_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

async def test_deconstruct():
    url = "http://localhost:8001/api/v1/whiteboard/deconstruct"
    payload = {
        "image_base64": TINY_PNG_BASE64,
        "session_id": "test_session"
    }
    
    print(f"Testing {url}...")
    async with httpx.AsyncClient() as client:
        try:
            # We expect it might fail or return a 400 if using a non-vision model
            # But we want to see it reach the LLM and handle the response.
            response = await client.post(url, json=payload, timeout=30.0)
            print(f"Status Code: {response.status_code}")
            print(f"Response: {response.text}")
            
            if response.status_code == 400:
                print("SUCCESS: Endpoint correctly detected non-vision model.")
            elif response.status_code == 200:
                print("SUCCESS: Endpoint successfully deconstructed (or hallucinated).")
            else:
                print(f"FAILURE: Unexpected status code {response.status_code}")
                
        except Exception as e:
            print(f"ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(test_deconstruct())
