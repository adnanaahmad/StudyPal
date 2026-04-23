# TutorBot Voice Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen voice session page (`/agents/[botId]/voice`) to the TutorBot feature, letting students speak to their TutorBot and hear it speak back, powered by Vocal Bridge.

**Architecture:** The backend adds a `POST /api/v1/tutorbot/{bot_id}/voice-token` endpoint that calls Vocal Bridge's token API with the bot's name and returns a short-lived session token. The frontend installs `@vocalbridgeai/react`, adds a **Voice** button beside **Chat** on running bots, and renders a full-screen orb page that drives connection state, transcript scrolling, mute/unmute, and end-call via Vocal Bridge hooks.

**Tech Stack:** FastAPI (Python), `httpx` (already in deps), pydantic-settings, Next.js 16, React 19, `@vocalbridgeai/sdk`, `@vocalbridgeai/react`, Tailwind CSS.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `deeptutor/config/settings.py` | Add `VOCAL_BRIDGE_API_KEY` + `VOCAL_BRIDGE_AGENT_ID` env vars |
| Modify | `.env.example` | Document the two new vars |
| Modify | `deeptutor/api/routers/tutorbot.py` | Add `POST /{bot_id}/voice-token` route |
| Modify | `web/app/(workspace)/agents/page.tsx` | Add Voice button to running bot action row |
| Create | `web/app/(workspace)/agents/[botId]/voice/page.tsx` | Full-screen voice session page |

---

## Task 1: Add Vocal Bridge config to settings

**Files:**
- Modify: `deeptutor/config/settings.py`
- Modify: `.env.example`

- [ ] **Step 1: Open `deeptutor/config/settings.py` and add the two new fields to `Settings`**

  The existing `Settings` class uses `pydantic-settings` with `env_prefix="LLM_"`. Vocal Bridge vars must be read without that prefix, so add them with explicit `alias` (via `validation_alias`) or switch to no-prefix fields. The cleanest approach in pydantic-settings is to add them at module level using a second `BaseSettings` subclass or to use `AliasChoices`. The simplest: add them as plain fields — pydantic-settings reads the env var matching the field name uppercased when no prefix applies. But the current class has `env_prefix="LLM_"`, so add them using `Field(validation_alias=...)`.

  Replace the `Settings` class definition so it includes:

  ```python
  from pydantic import AliasChoices, BaseModel, Field
  from pydantic_settings import BaseSettings, SettingsConfigDict


  class LLMRetryConfig(BaseModel):
      max_retries: int = Field(default=8, description="Maximum retry attempts for LLM calls")
      base_delay: float = Field(default=5.0, description="Base delay between retries in seconds")
      exponential_backoff: bool = Field(
          default=True, description="Whether to use exponential backoff"
      )


  class Settings(BaseSettings):
      # LLM retry configuration
      retry: LLMRetryConfig = Field(default_factory=LLMRetryConfig)

      # Vocal Bridge credentials
      vocal_bridge_api_key: str = Field(
          default="",
          validation_alias=AliasChoices("VOCAL_BRIDGE_API_KEY"),
          description="Vocal Bridge API key",
      )
      vocal_bridge_agent_id: str = Field(
          default="",
          validation_alias=AliasChoices("VOCAL_BRIDGE_AGENT_ID"),
          description="Vocal Bridge agent UUID",
      )

      # Deprecated: use retry instead
      @property
      def llm_retry(self):
          import warnings

          warnings.warn(
              "settings.llm_retry is deprecated, use settings.retry instead",
              DeprecationWarning,
              stacklevel=2,
          )
          return self.retry

      model_config = SettingsConfigDict(
          env_prefix="LLM_",
          env_nested_delimiter="__",
          extra="ignore",
      )


  # Global settings instance
  settings = Settings()
  ```

- [ ] **Step 2: Add Vocal Bridge vars to `.env.example`**

  Append at the end of `.env.example`:

  ```env
  # --------------------------------------------
  # Vocal Bridge (Voice mode for TutorBot)
  # --------------------------------------------
  VOCAL_BRIDGE_API_KEY=vb_your_key_here
  VOCAL_BRIDGE_AGENT_ID=your-agent-uuid-here
  ```

- [ ] **Step 3: Verify settings loads without error**

  ```bash
  python -c "from deeptutor.config.settings import settings; print(settings.vocal_bridge_api_key)"
  ```

  Expected output: `` (empty string — no key set yet, no crash)

- [ ] **Step 4: Commit**

  ```bash
  git add deeptutor/config/settings.py .env.example
  git commit -m "feat: add Vocal Bridge API key + agent ID to settings"
  ```

---

## Task 2: Backend voice-token endpoint

**Files:**
- Modify: `deeptutor/api/routers/tutorbot.py`

- [ ] **Step 1: Write the failing test**

  Create `tests/api/test_voice_token.py`:

  ```python
  import pytest
  from unittest.mock import AsyncMock, patch, MagicMock
  from fastapi.testclient import TestClient


  @pytest.fixture
  def client():
      from deeptutor.api.main import app
      return TestClient(app)


  def test_voice_token_bot_not_found(client):
      with patch("deeptutor.api.routers.tutorbot.get_tutorbot_manager") as mock_mgr:
          mgr = MagicMock()
          mgr.get_bot.return_value = None
          mgr._load_bot_config.return_value = None
          mock_mgr.return_value = mgr
          resp = client.post("/api/v1/tutorbot/nonexistent/voice-token")
      assert resp.status_code == 404


  def test_voice_token_bot_not_running(client):
      with patch("deeptutor.api.routers.tutorbot.get_tutorbot_manager") as mock_mgr:
          mgr = MagicMock()
          mgr.get_bot.return_value = None
          cfg = MagicMock()
          cfg.name = "MathBot"
          mgr._load_bot_config.return_value = cfg
          mock_mgr.return_value = mgr
          resp = client.post("/api/v1/tutorbot/mathbot/voice-token")
      assert resp.status_code == 409
      assert "not running" in resp.json()["detail"].lower()


  def test_voice_token_success(client):
      fake_vb_response = {
          "token": "tok_abc",
          "livekit_url": "wss://lk.example.com",
          "room_name": "room-123",
          "expires_in": 3600,
      }
      with (
          patch("deeptutor.api.routers.tutorbot.get_tutorbot_manager") as mock_mgr,
          patch("deeptutor.api.routers.tutorbot.httpx.AsyncClient") as mock_http,
      ):
          instance = MagicMock()
          instance.config.name = "MathBot"
          mgr = MagicMock()
          mgr.get_bot.return_value = instance
          mock_mgr.return_value = mgr

          http_instance = AsyncMock()
          http_instance.__aenter__ = AsyncMock(return_value=http_instance)
          http_instance.__aexit__ = AsyncMock(return_value=False)
          mock_response = MagicMock()
          mock_response.status_code = 200
          mock_response.json.return_value = fake_vb_response
          mock_response.raise_for_status = MagicMock()
          http_instance.post = AsyncMock(return_value=mock_response)
          mock_http.return_value = http_instance

          resp = client.post("/api/v1/tutorbot/mathbot/voice-token")

      assert resp.status_code == 200
      data = resp.json()
      assert data["token"] == "tok_abc"
      assert data["livekit_url"] == "wss://lk.example.com"
      assert data["room_name"] == "room-123"
      assert data["expires_in"] == 3600
  ```

- [ ] **Step 2: Run test to confirm it fails**

  ```bash
  pytest tests/api/test_voice_token.py -v
  ```

  Expected: FAIL — route not defined yet.

- [ ] **Step 3: Add the endpoint to `deeptutor/api/routers/tutorbot.py`**

  Add at the top of the file (with existing imports):
  ```python
  import httpx
  ```

  Add the route **before** the `@router.get("/{bot_id}")` route (so it is matched first — static path `/{bot_id}/voice-token` must come before the generic `/{bot_id}` GET):

  ```python
  @router.post("/{bot_id}/voice-token")
  async def get_voice_token(bot_id: str):
      from deeptutor.config.settings import settings

      mgr = get_tutorbot_manager()
      instance = mgr.get_bot(bot_id)
      if instance is None:
          # Bot exists but isn't running
          cfg = mgr._load_bot_config(bot_id)
          if cfg is None:
              raise HTTPException(status_code=404, detail="Bot not found")
          raise HTTPException(status_code=409, detail=f"Bot '{bot_id}' is not running")

      bot_name = instance.config.name

      async with httpx.AsyncClient() as client:
          resp = await client.post(
              "https://vocalbridgeai.com/api/v1/token",
              headers={
                  "X-API-Key": settings.vocal_bridge_api_key,
                  "X-Agent-Id": settings.vocal_bridge_agent_id,
              },
              json={"participant_name": bot_name, "session_id": bot_id},
              timeout=10.0,
          )
          resp.raise_for_status()
          data = resp.json()

      return {
          "token": data["token"],
          "livekit_url": data["livekit_url"],
          "room_name": data["room_name"],
          "expires_in": data.get("expires_in", 3600),
      }
  ```

  Place this block **after the `update_bot` route** and **before** any other `/{bot_id}` sub-routes — or, to be safe, immediately after the `@router.get("/recent")` block (static paths) and before `@router.get("/{bot_id}")`. The router matches in declaration order, so static sub-paths like `/{bot_id}/voice-token` are fine after the parameterized `/{bot_id}` GET as long as the method differs (POST vs GET). However, to be explicit and safe, add this route just before `@router.get("/{bot_id}")`.

- [ ] **Step 4: Run test to confirm it passes**

  ```bash
  pytest tests/api/test_voice_token.py -v
  ```

  Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add deeptutor/api/routers/tutorbot.py tests/api/test_voice_token.py
  git commit -m "feat: add POST /api/v1/tutorbot/{bot_id}/voice-token endpoint"
  ```

---

## Task 3: Install frontend packages

**Files:**
- Modify: `web/package.json` (via npm)

- [ ] **Step 1: Install Vocal Bridge packages**

  ```bash
  cd web && npm install @vocalbridgeai/sdk @vocalbridgeai/react
  ```

  Expected: packages added to `package.json` and `package-lock.json`, no peer-dependency errors.

- [ ] **Step 2: Commit**

  ```bash
  cd web && git add package.json package-lock.json
  git commit -m "feat: install @vocalbridgeai/sdk and @vocalbridgeai/react"
  ```

---

## Task 4: Add Voice button to running bot action row

**Files:**
- Modify: `web/app/(workspace)/agents/page.tsx`

The running bot action row currently renders `[Chat] [Stop] [Delete]`. We add `[Voice]` between Chat and Stop.

- [ ] **Step 1: Add `Mic` to the lucide import at the top of `agents/page.tsx`**

  Current import (line ~14):
  ```tsx
  import {
    Bot,
    FileText,
    Heart,
    Loader2,
    MessageCircle,
    Pencil,
    Play,
    Plus,
    Save,
    Square,
    Trash2,
    X,
  } from "lucide-react";
  ```

  Replace with:
  ```tsx
  import {
    Bot,
    FileText,
    Heart,
    Loader2,
    MessageCircle,
    Mic,
    Pencil,
    Play,
    Plus,
    Save,
    Square,
    Trash2,
    X,
  } from "lucide-react";
  ```

- [ ] **Step 2: Insert the Voice button after the Chat button in the running-bot action row**

  Locate the `<button` that calls `router.push(\`/agents/${bot.bot_id}/chat\`)` (around line 387). After its closing `</button>` tag add:

  ```tsx
  <button
    type="button"
    onClick={() => router.push(`/agents/${bot.bot_id}/voice`)}
    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)]/50 px-3 py-1.5 text-[12px] font-medium text-[var(--muted-foreground)] transition-colors hover:border-[var(--border)] hover:text-[var(--foreground)]"
  >
    <Mic className="h-3 w-3" />
    {t("Voice")}
  </button>
  ```

- [ ] **Step 3: Verify the page still type-checks**

  ```bash
  cd web && npm run lint
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add web/app/\(workspace\)/agents/page.tsx
  git commit -m "feat: add Voice button to running TutorBot action row"
  ```

---

## Task 5: Create the full-screen voice session page

**Files:**
- Create: `web/app/(workspace)/agents/[botId]/voice/page.tsx`

- [ ] **Step 1: Create the file**

  ```tsx
  "use client";

  import { useEffect, useRef } from "react";
  import { useParams, useRouter } from "next/navigation";
  import { ArrowLeft, Mic, MicOff, PhoneOff } from "lucide-react";
  import { VocalBridgeProvider, useVocalBridge, useTranscript } from "@vocalbridgeai/react";
  import { ConnectionState } from "@vocalbridgeai/sdk";

  /* ── Provider wrapper (keeps tokenUrl stable across renders) ── */

  export default function VoicePage() {
    const { botId } = useParams<{ botId: string }>();
    const tokenUrl = `/api/v1/tutorbot/${botId}/voice-token`;

    return (
      <VocalBridgeProvider options={{ auth: { tokenUrl } }}>
        <VoiceSession botId={botId} />
      </VocalBridgeProvider>
    );
  }

  /* ── Session inner component ── */

  function VoiceSession({ botId }: { botId: string }) {
    const router = useRouter();
    const { state, connect, disconnect, toggleMicrophone, isMicrophoneEnabled, error } =
      useVocalBridge();
    const { transcript } = useTranscript();
    const transcriptEndRef = useRef<HTMLDivElement>(null);

    // Connect on mount
    useEffect(() => {
      void connect();
    }, [connect]);

    // Auto-scroll transcript
    useEffect(() => {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [transcript]);

    const handleEnd = async () => {
      await disconnect();
      router.push("/agents");
    };

    const handleBack = async () => {
      await disconnect();
      router.push("/agents");
    };

    /* ── Orb state derivation ── */
    const latestEntry = transcript[transcript.length - 1];
    const agentSpeaking =
      state === ConnectionState.Connected &&
      latestEntry?.role === "agent" &&
      !!latestEntry.text;

    const orbClass = orbAnimation(state as ConnectionState, agentSpeaking);
    const statusLabel = statusText(state as ConnectionState, agentSpeaking, botId, error);

    return (
      <div className="fixed inset-0 flex flex-col items-center bg-[var(--background)] text-[var(--foreground)]">
        {/* Back arrow */}
        <button
          type="button"
          onClick={handleBack}
          className="absolute left-4 top-4 rounded-lg p-2 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          aria-label="Back to agents"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {/* Orb + label */}
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <div
            className={`rounded-full ${orbClass}`}
            style={{ width: 120, height: 120 }}
            aria-label={statusLabel}
          />
          <span
            className={`text-[15px] font-medium ${
              error ? "text-red-400" : "text-[var(--muted-foreground)]"
            }`}
          >
            {statusLabel}
          </span>

          {/* Mute button */}
          <button
            type="button"
            onClick={() => void toggleMicrophone()}
            className="mt-2 inline-flex items-center gap-2 rounded-full border border-[var(--border)]/50 px-4 py-2 text-[13px] transition-colors hover:border-[var(--border)]"
            aria-label={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
          >
            {isMicrophoneEnabled ? (
              <Mic className="h-4 w-4" />
            ) : (
              <MicOff className="h-4 w-4 text-red-400" />
            )}
            {isMicrophoneEnabled ? "Mute" : "Unmute"}
          </button>
        </div>

        {/* Transcript */}
        {transcript.length > 0 && (
          <div className="w-full max-w-lg overflow-y-auto px-4 pb-4" style={{ maxHeight: "35vh" }}>
            {transcript.map((entry, i) => (
              <div
                key={i}
                className={`mb-2 flex ${entry.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <span
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-snug ${
                    entry.role === "user"
                      ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                      : "bg-[var(--muted)] text-[var(--foreground)]"
                  }`}
                >
                  {entry.text}
                </span>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        )}

        {/* End Call button */}
        <div className="mb-8">
          <button
            type="button"
            onClick={() => void handleEnd()}
            className="inline-flex items-center gap-2 rounded-full bg-red-500 px-6 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-red-600"
          >
            <PhoneOff className="h-4 w-4" />
            End Call
          </button>
        </div>
      </div>
    );
  }

  /* ── Orb animation helper ── */

  function orbAnimation(state: ConnectionState, agentSpeaking: boolean): string {
    const base = "transition-all duration-500";
    if (state === ConnectionState.Connected) {
      if (agentSpeaking) {
        // ripple rings
        return `${base} bg-[var(--primary)]/30 shadow-[0_0_0_16px_var(--primary)/10,0_0_0_32px_var(--primary)/5] animate-pulse`;
      }
      // gentle breathe
      return `${base} bg-[var(--primary)]/60 animate-[breathe_3s_ease-in-out_infinite]`;
    }
    if (
      state === ConnectionState.Connecting ||
      (state as string) === "waiting_for_agent"
    ) {
      // slow pulse
      return `${base} bg-[var(--primary)]/40 animate-pulse`;
    }
    // disconnected / error
    return `${base} bg-[var(--muted)]`;
  }

  /* ── Status label helper ── */

  function statusText(
    state: ConnectionState,
    agentSpeaking: boolean,
    botId: string,
    error: Error | null | undefined,
  ): string {
    if (error) return error.message;
    if (state === ConnectionState.Connected) {
      return agentSpeaking ? "Speaking…" : botId;
    }
    if (
      state === ConnectionState.Connecting ||
      (state as string) === "waiting_for_agent"
    ) {
      return "Connecting…";
    }
    return "Ready";
  }
  ```

- [ ] **Step 2: Verify it type-checks**

  ```bash
  cd web && npm run lint
  ```

  Expected: no errors. (If `@vocalbridgeai/react` or `@vocalbridgeai/sdk` export slightly different names from what's in the spec, align with the actual package exports — run `node -e "console.log(Object.keys(require('@vocalbridgeai/react')))"` to inspect.)

- [ ] **Step 3: Start the dev server and manually test the page**

  ```bash
  cd web && npm run dev
  ```

  1. Navigate to `http://localhost:3782/agents`.
  2. Start a bot → confirm **Voice** button appears beside **Chat**.
  3. Click **Voice** → page loads at `/agents/<botId>/voice`.
  4. Orb is visible. Back arrow navigates back to `/agents`.
  5. (Without real Vocal Bridge credentials the connection will fail — confirm the error state renders the error message instead of crashing.)

- [ ] **Step 4: Commit**

  ```bash
  git add "web/app/(workspace)/agents/[botId]/voice/page.tsx"
  git commit -m "feat: add full-screen voice session page for TutorBot"
  ```

---

## Task 6: Wire the tokenUrl through Next.js API proxy (if needed)

**Context:** The voice page calls `/api/v1/tutorbot/${botId}/voice-token` which must reach the Python backend. Vocal Bridge's `auth.tokenUrl` makes a **GET** request to this URL and expects `{ token, livekit_url, ... }`. Our backend exposes a **POST** endpoint. Vocal Bridge's tokenUrl convention typically issues a GET; verify the package docs.

- [ ] **Step 1: Check what HTTP method Vocal Bridge uses for `auth.tokenUrl`**

  ```bash
  node -e "
  const pkg = require('@vocalbridgeai/react');
  console.log('exports:', Object.keys(pkg));
  "
  ```

  Read the package README or source to confirm whether it GETs or POSTs `tokenUrl`.

- [ ] **Step 2a (if GET): Change the backend endpoint from POST to GET**

  In `deeptutor/api/routers/tutorbot.py`, change `@router.post("/{bot_id}/voice-token")` → `@router.get("/{bot_id}/voice-token")`. Update the test fixture method to `client.get(...)`.

  ```bash
  pytest tests/api/test_voice_token.py -v
  ```

  Expected: all tests pass.

- [ ] **Step 2b (if POST is correct): No change needed**

  Skip this task and move on.

- [ ] **Step 3: Commit if any changes were made**

  ```bash
  git add deeptutor/api/routers/tutorbot.py tests/api/test_voice_token.py
  git commit -m "fix: align voice-token HTTP method with Vocal Bridge tokenUrl convention"
  ```

---

## Self-Review Checklist

### Spec coverage

| Spec requirement | Task |
|-----------------|------|
| `POST /api/v1/tutorbot/{bot_id}/voice-token` endpoint | Task 2 |
| Load bot name, call Vocal Bridge, return `{token, livekit_url, room_name, expires_in}` | Task 2 |
| `VOCAL_BRIDGE_API_KEY` + `VOCAL_BRIDGE_AGENT_ID` in config + `.env.example` | Task 1 |
| Voice button on running bots in `/agents` | Task 4 |
| Navigate to `/agents/[botId]/voice` | Task 4 |
| `VocalBridgeProvider` with `auth.tokenUrl` | Task 5 |
| Orb with 5 animation states | Task 5 |
| Bot name / status label below orb | Task 5 |
| Mute/unmute button | Task 5 |
| Transcript scroll area, user right / agent left | Task 5 |
| End Call button (red, always visible) | Task 5 |
| Back arrow → disconnect + navigate to `/agents` | Task 5 |
| Error states rendered (token fetch fail → inline error, mic denied → error message) | Task 5 (error state in `statusText`) |
| Bot not running → 409 | Task 2 |
| Bot not found → 404 | Task 2 |
| Phase C migration: no frontend changes needed | Architecture (no hook plumbing required in Phase A) |

### Placeholder scan

No TBDs, TODOs, or vague steps present.

### Type consistency

- `ConnectionState` imported from `@vocalbridgeai/sdk` and used consistently in both `orbAnimation` and `statusText`.
- `useTranscript()` returns `{ transcript: [{ role, text }] }` — used consistently as `entry.role` and `entry.text`.
- `instance.config.name` in backend matches `BotConfig.name` as used throughout `tutorbot.py`.
