# TutorBot Voice Mode — Design Spec
Date: 2026-04-17  
Status: Approved for implementation

---

## Overview

Add a full-screen voice session page to the TutorBot feature, accessible from the Bots tab. Students speak to their TutorBot and it speaks back — a Siri/ChatGPT-style experience. Phase A uses Vocal Bridge's native LLM with the bot's soul as the system prompt. Phase C (future) wires Vocal Bridge's `onAIAgentQuery` hook to DeepTutor's RAG pipeline and vector DB.

---

## User Flow

1. User is on `/agents` (Bots tab). A running bot now shows three action buttons: **Chat**, **Voice**, **Stop**.
2. User clicks **Voice** → navigates to `/agents/[botId]/voice`.
3. Page connects to Vocal Bridge, shows an animated orb and the bot's name.
4. User speaks → orb animates → bot speaks back → live transcript scrolls below.
5. User clicks **End Call** (or back arrow) → session disconnects → returns to `/agents`.

---

## Architecture

### Phase A (shipping now)

```
Browser /agents/[botId]/voice
  │
  ├── 1. GET /api/v1/tutorbot/{bot_id}/voice-token
  │         Backend reads bot SOUL.md persona
  │         Calls POST https://vocalbridgeai.com/api/v1/token
  │           Header: X-API-Key: VOCAL_BRIDGE_API_KEY
  │                   X-Agent-Id: VOCAL_BRIDGE_AGENT_ID
  │           Body:   { participant_name: bot.name, session_id?: botId }
  │         Returns { token, livekit_url, room_name, expires_in } to frontend
  │
  └── 2. @vocalbridgeai/react wraps livekit-client
            <VocalBridgeProvider options={{ auth: { tokenUrl } }}>
            useVocalBridge() → { state, connect, disconnect, toggleMicrophone, isMicrophoneEnabled, error }
            useTranscript()  → { transcript: [{ role, text }] }
            state values: disconnected → connecting → waiting_for_agent → connected
```

### Phase C (future — no frontend changes required)

Wire `useAIAgent` / `onAIAgentQuery` to DeepTutor's RAG pipeline. The voice page component is untouched — only the `onQuery` handler changes.

```ts
// Phase A: omit useAIAgent entirely — Vocal Bridge native LLM handles queries
// Phase C: add this hook inside VoiceChat
useAIAgent({
  onQuery: async (query) => {
    return await deepTutorAgent.ask(query); // RAG, vector DB, student memory
  },
});
```

---

## Backend

### New endpoint

```
POST /api/v1/tutorbot/{bot_id}/voice-token
```

**Logic:**
1. Load the bot config (name from DB/config).
2. `POST https://vocalbridgeai.com/api/v1/token` with:
   - Header: `X-API-Key: VOCAL_BRIDGE_API_KEY`
   - Header: `X-Agent-Id: VOCAL_BRIDGE_AGENT_ID`
   - Body: `{ participant_name: bot.name, session_id: bot_id }`
3. Return `{ token, livekit_url, room_name, expires_in }` to the frontend.

**Config:**
- `VOCAL_BRIDGE_API_KEY` and `VOCAL_BRIDGE_AGENT_ID` added to `deeptutor/config/` `.env.example`.
- Read via `deeptutor.config` settings (pydantic-settings pattern).

**Location:** New route in `deeptutor/api/` under the existing tutorbot router.

---

## Frontend

### 1. Voice button on running bots — `agents/page.tsx`

In `BotsTab`, running bot action row changes from:
```
[Chat] [Stop] [Delete]
```
to:
```
[Chat] [Voice] [Stop] [Delete]
```

Voice button navigates to `/agents/[botId]/voice`.

### 2. New page — `web/app/(workspace)/agents/[botId]/voice/page.tsx`

**Dependencies:**
```
npm install @vocalbridgeai/sdk @vocalbridgeai/react
```

**Page structure:**
```tsx
import { VocalBridgeProvider, useVocalBridge, useTranscript } from '@vocalbridgeai/react';
import { ConnectionState } from '@vocalbridgeai/sdk';

export default function VoicePage() {
  const tokenUrl = `/api/v1/tutorbot/${botId}/voice-token`;
  return (
    <VocalBridgeProvider options={{ auth: { tokenUrl } }}>
      <VoiceSession botId={botId} />
    </VocalBridgeProvider>
  );
}

function VoiceSession({ botId }) {
  const { state, connect, disconnect, toggleMicrophone, isMicrophoneEnabled, error } = useVocalBridge();
  const { transcript } = useTranscript();
  // state: disconnected → connecting → waiting_for_agent → connected
  // drives orb animation and status label
}
```

**Orb states:**

| `state` value | Orb animation | Label |
|--------------|--------------|-------|
| `disconnected` | static | "Ready" |
| `connecting` / `waiting_for_agent` | slow pulse | "Connecting…" |
| `connected` (listening) | gentle breathe | bot name |
| `connected` (agent speaking) | ripple rings | "Speaking…" |
| error | static, red tint | error message |

Note: agent-speaking state is detected via `useTranscript` — when the latest entry has `role === 'agent'` and text is actively streaming.

**Layout:**
- Full-screen dark background (uses `var(--background)`)
- Back arrow top-left → `/agents` (triggers `disconnect()` first)
- Centered orb (CSS animation, driven by state)
- Bot name / status label below orb
- Mute/unmute button below label (mic icon, toggles `toggleMicrophone()`)
- Transcript scroll area — pills for each `{ role, text }` entry from `useTranscript()`
  - User entries: right-aligned, primary background
  - Agent entries: left-aligned, muted background
- **End Call** button bottom-center (red, always visible, calls `disconnect()`)
- No text input on this page

### 3. No custom hook needed
`@vocalbridgeai/react` provides `useVocalBridge`, `useTranscript`, and `useAgentActions`. The page component uses them directly.

---

## Error States

| Error | UI |
|-------|----|
| Bot not running | Redirect to `/agents` with toast "Bot is not running" |
| Token fetch fails | Show inline error with retry button |
| WebRTC connection drops | Show "Connection lost" state, offer reconnect button |
| Microphone permission denied | Show "Microphone access required" with instructions |

---

## Environment Variables

```env
# .env.example additions
VOCAL_BRIDGE_API_KEY=vb_your_key_here
VOCAL_BRIDGE_AGENT_ID=your-agent-uuid-here
```

---

## Phase A → C Migration Path

| Concern | Phase A | Phase C |
|---------|---------|---------|
| Voice agent LLM | Vocal Bridge native | Vocal Bridge + `onAIAgentQuery` |
| Knowledge access | Soul prompt only | RAG, vector DB, student memory |
| Backend changes | Token endpoint only | Token endpoint + MCP server or query bridge |
| **Frontend changes** | — | **None** |

---

## Out of Scope (Phase A)

- Recording / saving voice sessions to Notebook
- Multi-language voice support
- Voice avatar beyond orb animation
- Mobile / PWA considerations
