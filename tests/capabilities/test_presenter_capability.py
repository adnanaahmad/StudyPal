from __future__ import annotations

import asyncio
from typing import Any

import pytest

from deeptutor.capabilities.presenter import PresenterCapability
from deeptutor.core.context import UnifiedContext
from deeptutor.core.stream import StreamEvent, StreamEventType
from deeptutor.core.stream_bus import StreamBus


async def _collect_events(run_coro) -> list[StreamEvent]:
    bus = StreamBus()
    events: list[StreamEvent] = []

    async def _consume() -> None:
        async for event in bus.subscribe():
            events.append(event)

    consumer = asyncio.create_task(_consume())
    await asyncio.sleep(0)
    await run_coro(bus)
    await asyncio.sleep(0)
    await bus.close()
    await consumer
    return events


@pytest.mark.asyncio
async def test_presenter_capability_uses_llm_slide_content(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    async def fake_complete(*_args: Any, **_kwargs: Any) -> str:
        return """
[
  {
    "title": "Introduction",
    "content": "What programming is and why it matters",
    "points": ["Algorithms and data", "Problem-solving mindset"]
  },
  {
    "title": "Key Concepts",
    "content": "Core building blocks",
    "points": ["Variables", "Control flow", "Functions"]
  }
]
"""

    def fake_create_deck(title: str, slides: list[dict[str, Any]], output_path: str) -> str:
        captured["title"] = title
        captured["slides"] = slides
        captured["output_path"] = output_path
        return output_path

    class _FakePathService:
        def get_decks_dir(self):
            from pathlib import Path

            return Path("/tmp/deeptutor-tests/decks")

    monkeypatch.setattr("deeptutor.capabilities.presenter.complete", fake_complete)
    monkeypatch.setattr("deeptutor.capabilities.presenter.create_deck", fake_create_deck)
    monkeypatch.setattr(
        "deeptutor.capabilities.presenter.get_path_service", lambda: _FakePathService()
    )

    capability = PresenterCapability()
    context = UnifiedContext(
        user_message="programming",
        metadata={"source_text": "Programming helps automate repetitive tasks."},
    )
    events = await _collect_events(lambda bus: capability.run(context, bus))

    assert captured["title"] == "programming"
    assert len(captured["slides"]) == 2
    assert captured["slides"][0]["content"] == "What programming is and why it matters"
    assert captured["slides"][0]["points"] == ["Algorithms and data", "Problem-solving mindset"]
    assert all("Detail about" not in slide["content"] for slide in captured["slides"])

    result_event = next(event for event in events if event.type == StreamEventType.RESULT)
    assert result_event.metadata["slides_count"] == 2
