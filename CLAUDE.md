# DeepTutor

## Project Overview
Agent-native personalized tutoring platform with a Python/FastAPI backend (multi-agent RAG pipeline) and a Next.js 16 / React 19 frontend.

## Commands

### Install dependencies
```bash
# macOS: system deps required by manim (Math Animator)
brew install cairo pkg-config

# Python (all extras)
uv sync --all-extras

# Frontend
cd web && npm install
```

### Backend (Python)
```bash
# Setup (first time): interactive config + launch
python scripts/start_tour.py

# Start backend + frontend together
uv run python scripts/start_web.py

# Backend only (uvicorn via Python API, not CLI — avoids Windows path issues)
python deeptutor/api/run_server.py

# Run tests
pytest

# Lint
ruff check .
ruff format .

# Type check
mypy deeptutor/

# Security lint
bandit -r deeptutor/
```

### Frontend
```bash
cd web
npm run dev          # Standard dev server
npm run dev:turbo    # Turbopack (faster, higher memory)
npm run build
npm run lint
npm run i18n:check   # Verify i18n parity across all locales
npm run audit        # Playwright UI audit
```

### Docker
```bash
docker compose up                   # Production
docker compose -f docker-compose.dev.yml up   # Dev
docker compose -f docker-compose.ghcr.yml up  # Pre-built GHCR images
```

### CLI
```bash
deeptutor --help   # Requires `pip install -e .[all]`
```

## Architecture

```
deeptutor/           # Python package (backend + SDK)
  agents/            # Per-mode agent implementations (chat, solve, research, guide, co_writer, question, math_animator)
  capabilities/      # Thin wrappers exposing each agent mode as a BaseCapability (used by the API layer)
  tools/             # Stateless tool functions (rag, web_search, reason, brainstorm, code_executor, paper_search)
    builtin/         # Tool wrapper classes for agent tool-use protocol
    prompting/       # ToolPromptComposer — assembles tool hints into system prompts
  app/               # DeepTutorApp facade — single entry point for CLI, web, and SDK
  api/               # FastAPI routers + run_server.py
  core/              # Shared primitives
  services/          # LLM, embedding, prompt, and config service adapters
  config/            # Settings (pydantic-settings, reads from .env)
  knowledge/         # RAG knowledge base management
  tutorbot/          # TutorBot autonomous tutor (powered by nanobot)
  runtime/           # Session/memory runtime
  events/            # Event bus
  logging/           # LLMStats + structured logging

deeptutor_cli/       # `deeptutor` CLI entry point (typer)

web/                 # Next.js 16 frontend
  app/               # App Router pages
  components/        # React components
  hooks/             # Custom React hooks
  context/           # React context providers
  locales/           # i18n translation files (en is canonical)
  lib/               # Shared utilities
  tests/             # Playwright tests

tests/               # Python pytest suite
scripts/             # Dev/ops helpers (start_web.py, start_tour.py, migration scripts)
```

## Code Conventions

**Python**
- Line length: 100 (Black + Ruff enforce this).
- All new agents must subclass `deeptutor.agents.base_agent.BaseAgent` and implement `process()`.
- Tools in `deeptutor/tools/` are stateless functions; wrap them in a `builtin/` class only when they need to participate in the agent tool-use protocol.
- `deeptutor/tools/__init__.py` uses lazy imports — add new public exports to `_LAZY_EXPORTS`, not as direct imports.
- `deeptutor/capabilities/__init__.py` exports capability classes; each capability wraps exactly one agent module.
- LLM calls go through `deeptutor.services.llm` — never call provider SDKs directly from agents or tools.
- `os.makedirs`, `os.path.join`, and bare `open()` are allowed (ruff PTH rules are suppressed intentionally).

**Frontend**
- Tailwind CSS only — no inline styles or CSS modules.
- `en` locale in `web/locales/en/` is the source of truth; run `npm run i18n:check` after adding any new string.
- Use `next/image` and App Router conventions (no `pages/` directory).

## Constraints
- Never commit `.env` — it is gitignored. Use `deeptutor/config/` `.env.example` as the template.
- `DISABLE_SSL_VERIFY=true` must never be set in production.
- `python deeptutor/api/run_server.py` must be used to start the backend (not `uvicorn` CLI directly) — the Python API sets Windows event loop policy required for Math Animator subprocess calls.
- Do not use `litellm` — it was removed in v1.0.0-beta.3. Use the native `openai` or `anthropic` SDK via `deeptutor.services.llm`.

## Gotchas
- `ruff` has many rules intentionally suppressed (E722 bare except, E402 import order, F841 unused vars, ERA001 commented code). Don't re-enable them without understanding why they're off.
- The `extract_numbered_items.sh` script in `scripts/` is deprecated and intentionally exits with an error — don't restore it.
- `npm run dev:turbo` requires `--max-old-space-size=6144`; plain `dev` uses 4096. OOM crashes during build usually mean switching to turbo or increasing the limit.
- Playwright tests live in `web/tests/` (UI audit) and are run with `npm run audit`, not `npx playwright test` directly — the config selects only the `ui-audit` project.
- `asyncio_default_fixture_loop_scope = "function"` is set in pytest config; async test fixtures must not assume a shared event loop across tests.
