from __future__ import annotations

import importlib
import pytest
import sys
import types


@pytest.fixture(autouse=True)
def _cleanup_notebook_router_module():
    yield
    sys.modules.pop("deeptutor.api.routers.notebook", None)


def _package(name: str) -> types.ModuleType:
    module = types.ModuleType(name)
    module.__path__ = []
    return module


def _load_notebook_router_module(monkeypatch: pytest.MonkeyPatch):
    sys.modules.pop("deeptutor.api.routers.notebook", None)

    fake_agents = _package("deeptutor.agents")
    fake_agents_notebook = types.ModuleType("deeptutor.agents.notebook")

    class _PlaceholderAgent:
        def __init__(self, *_args, **_kwargs) -> None:
            pass

    fake_agents_notebook.NotebookSummarizeAgent = _PlaceholderAgent
    fake_agents.notebook = fake_agents_notebook
    monkeypatch.setitem(sys.modules, "deeptutor.agents", fake_agents)
    monkeypatch.setitem(sys.modules, "deeptutor.agents.notebook", fake_agents_notebook)

    fake_services_notebook = types.ModuleType("deeptutor.services.notebook")
    fake_services_notebook.notebook_manager = object()
    monkeypatch.setitem(sys.modules, "deeptutor.services.notebook", fake_services_notebook)

    return importlib.import_module("deeptutor.api.routers.notebook")


@pytest.mark.asyncio
async def test_build_record_summary_prefers_generic_summary_source(monkeypatch: pytest.MonkeyPatch) -> None:
    notebook_router = _load_notebook_router_module(monkeypatch)
    captured: dict[str, str] = {}

    class _FakeAgent:
        def __init__(self, language: str = "en") -> None:
            captured["language"] = language

        async def summarize(
            self,
            *,
            title: str,
            record_type: str,
            user_query: str,
            output: str,
            metadata: dict | None = None,
        ) -> str:
            captured["title"] = title
            captured["record_type"] = record_type
            captured["user_query"] = user_query
            captured["output"] = output
            return "summary"

    monkeypatch.setattr(notebook_router, "NotebookSummarizeAgent", _FakeAgent)

    request = notebook_router.AddRecordRequest(
        notebook_ids=["nb1"],
        record_type="whiteboard",
        title="Architecture Diagram",
        user_query="show client server flow",
        output="data:image/svg+xml;base64,huge-payload",
        metadata={"summary_source": "User: show client server flow\nAssistant: added client and server"},
    )

    summary = await notebook_router._build_record_summary(request)

    assert summary == "summary"
    assert captured["output"] == request.metadata["summary_source"]
