# Whiteboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Whiteboard page to DeepTutor with a draw.io canvas + AI chat panel that generates/modifies diagrams using RAG, Web Search, and Reason tools, with auto-save per session and Save to Notebook support.

**Architecture:** Copy the draw.io postMessage integration pattern from next-ai-draw-io into DeepTutor as a native `/whiteboard` route. The draw.io canvas is an iframe (draw.io's embed URL), controlled via the postMessage API. The AI panel reuses Co-Writer's tool/source pattern (`AgenticChatPipeline` + `UnifiedContext`). Diagram XML is persisted in the session's `preferences_json` field via the existing `update_session_preferences` method.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS, FastAPI, `deeptutor.services.session.sqlite_store.SQLiteSessionStore`, `deeptutor.agents.chat.agentic_pipeline.AgenticChatPipeline`, `deeptutor.core.context.UnifiedContext`, draw.io embed iframe + postMessage API.

---

## File Map

### New files (frontend)
| File | Responsibility |
|------|---------------|
| `web/app/(workspace)/whiteboard/page.tsx` | Main page — layout shell, wires canvas + AI panel + toolbar |
| `web/app/(workspace)/whiteboard/hooks/useDrawioCanvas.ts` | draw.io iframe ref + postMessage send/receive + theme sync |
| `web/app/(workspace)/whiteboard/hooks/useWhiteboardSession.ts` | Auto-save/load diagram XML via backend API, debounce logic |
| `web/app/(workspace)/whiteboard/components/WhiteboardToolbar.tsx` | Top bar: title, Save to Notebook button, Export button |
| `web/app/(workspace)/whiteboard/components/DrawioCanvas.tsx` | draw.io iframe with theme-aware URL, error state |
| `web/app/(workspace)/whiteboard/components/WhiteboardAIPanel.tsx` | Right-side chat panel: messages, input, source selector, tool toggles |

### New files (backend)
| File | Responsibility |
|------|---------------|
| `deeptutor/api/routers/whiteboard.py` | Three endpoints: generate, get session XML, save session XML |

### Modified files
| File | Change |
|------|--------|
| `web/components/sidebar/SidebarShell.tsx` | Add Whiteboard to `PRIMARY_NAV` |
| `web/components/notebook/SaveToNotebookModal.tsx` | Add `"whiteboard"` to `RecordType` union |
| `deeptutor/api/main.py` | Import and register `whiteboard` router |
| `web/locales/en/common.json` | Add Whiteboard i18n keys |

---

## Task 1: Backend router — session persistence endpoints

**Files:**
- Create: `deeptutor/api/routers/whiteboard.py`
- Modify: `deeptutor/api/main.py`

- [ ] **Step 1: Create the whiteboard router with GET and PUT session endpoints**

```python
# deeptutor/api/routers/whiteboard.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from deeptutor.services.session.sqlite_store import get_sqlite_session_store

router = APIRouter()


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
```

- [ ] **Step 2: Register the router in main.py**

Open `deeptutor/api/main.py`. In the router imports block (around line 187), add:
```python
from deeptutor.api.routers import (
    # ... existing imports ...
    whiteboard,
)
```

After the other `app.include_router` calls (around line 225), add:
```python
app.include_router(whiteboard.router, prefix="/api/v1/whiteboard", tags=["whiteboard"])
```

- [ ] **Step 3: Verify the session store returns `preferences` field**

Run the backend and check that `GET /api/v1/sessions/{any_valid_id}` returns a `preferences` key. If the field is named differently, check `_get_session_sync` in `deeptutor/services/session/sqlite_store.py` and update the key name in `whiteboard.py` accordingly.

- [ ] **Step 4: Test both endpoints manually**

```bash
python deeptutor/api/run_server.py
# In another terminal:
curl -X PUT http://localhost:8000/api/v1/whiteboard/session/test-session-123 \
  -H "Content-Type: application/json" \
  -d '{"xml": "<mxGraphModel><root></root></mxGraphModel>"}'
# Expected: {"ok": true}

curl http://localhost:8000/api/v1/whiteboard/session/test-session-123
# Expected: {"xml": "<mxGraphModel><root></root></mxGraphModel>"}
```

- [ ] **Step 5: Commit**

```bash
git add deeptutor/api/routers/whiteboard.py deeptutor/api/main.py
git commit -m "feat: add whiteboard session persistence endpoints"
```

---

## Task 2: Backend router — AI diagram generation endpoint

**Files:**
- Modify: `deeptutor/api/routers/whiteboard.py`

- [ ] **Step 1: Add the generate endpoint to the whiteboard router**

Append to `deeptutor/api/routers/whiteboard.py`:

```python
import asyncio
from typing import Literal

from deeptutor.agents.chat.agentic_pipeline import AgenticChatPipeline
from deeptutor.core.context import UnifiedContext
from deeptutor.core.stream_bus import StreamBus
from deeptutor.services.config import PROJECT_ROOT, load_config_with_main
from deeptutor.services.settings.interface_settings import get_ui_language

_config = load_config_with_main("main.yaml", PROJECT_ROOT)

SYSTEM_PROMPT = (
    "You are a diagram generation assistant. When given a request, you MUST respond with "
    "valid draw.io XML (mxGraphModel format). Output ONLY the XML — no markdown, no prose, "
    "no code fences. If modifying an existing diagram, incorporate the changes into the "
    "provided XML and return the full updated XML."
)


class GenerateRequest(BaseModel):
    prompt: str
    current_xml: str = ""
    session_id: str
    source: Literal["none", "rag", "web"] = "none"
    knowledge_base_id: str | None = None
    tools: list[str] = []


class GenerateResponse(BaseModel):
    xml: str
    message: str


def _normalize_tools(tools: list[str]) -> list[str]:
    allowed = {"rag", "web_search", "reason"}
    return [t for t in tools if t in allowed]


@router.post("/generate")
async def generate_diagram(request: GenerateRequest) -> GenerateResponse:
    language = get_ui_language(
        default=_config.get("system", {}).get("language", "en")
    )
    tools = _normalize_tools(request.tools)
    knowledge_bases = (
        [request.knowledge_base_id]
        if request.knowledge_base_id and ("rag" in tools or request.source == "rag")
        else []
    )

    user_message = request.prompt
    if request.current_xml:
        user_message = (
            f"{request.prompt}\n\nCurrent diagram XML:\n{request.current_xml}"
        )

    context = UnifiedContext(
        session_id=request.session_id,
        user_message=user_message,
        system_prompt=SYSTEM_PROMPT,
        enabled_tools=tools,
        knowledge_bases=knowledge_bases,
    )

    active_stream = StreamBus()
    pipeline = AgenticChatPipeline(language=language)
    enabled_tools = pipeline._normalize_enabled_tools(context.enabled_tools)
    await pipeline._stage_thinking(context, enabled_tools, active_stream)
    result = await pipeline._stage_response(
        context,
        enabled_tools=enabled_tools,
        active_stream=active_stream,
    )

    xml = result.strip()
    # Strip markdown fences if model wrapped the XML anyway
    if xml.startswith("```"):
        lines = xml.split("\n")
        xml = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    return GenerateResponse(xml=xml, message="Diagram updated.")
```

- [ ] **Step 2: Test the generate endpoint**

```bash
python deeptutor/api/run_server.py
# In another terminal (replace session_id with a real session):
curl -X POST http://localhost:8000/api/v1/whiteboard/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Draw a simple flowchart with Start, Process, and End nodes",
    "current_xml": "",
    "session_id": "test-session-123",
    "source": "none",
    "tools": []
  }'
# Expected: {"xml": "<mxGraphModel>...</mxGraphModel>", "message": "Diagram updated."}
```

- [ ] **Step 3: Commit**

```bash
git add deeptutor/api/routers/whiteboard.py
git commit -m "feat: add whiteboard AI diagram generation endpoint"
```

---

## Task 3: Add Whiteboard to sidebar

**Files:**
- Modify: `web/components/sidebar/SidebarShell.tsx`

- [ ] **Step 1: Add the Whiteboard nav entry**

Open `web/components/sidebar/SidebarShell.tsx`.

Add `PenSquare` to the lucide-react import (line ~10):
```tsx
import {
  BookOpen,
  Bot,
  Brain,
  GraduationCap,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  PenSquare,
  Plus,
  Settings,
  type LucideIcon,
} from "lucide-react";
```

In `PRIMARY_NAV` (line ~31), insert after the Guided Learning entry:
```tsx
const PRIMARY_NAV: NavEntry[] = [
  { href: "/", label: "Chat", icon: MessageSquare },
  { href: "/agents", label: "TutorBot", icon: Bot },
  { href: "/co-writer", label: "Co-Writer", icon: PenLine },
  { href: "/guide", label: "Guided Learning", icon: GraduationCap },
  { href: "/whiteboard", label: "Whiteboard", icon: PenSquare },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/memory", label: "Memory", icon: Brain },
];
```

- [ ] **Step 2: Verify sidebar renders correctly**

```bash
cd web && npm run dev
```

Open http://localhost:3000 — confirm "Whiteboard" appears in the sidebar between "Guided Learning" and "Knowledge" in both expanded and collapsed states. The active state highlight should work when navigating to `/whiteboard`.

- [ ] **Step 3: Commit**

```bash
git add web/components/sidebar/SidebarShell.tsx
git commit -m "feat: add Whiteboard to sidebar nav"
```

---

## Task 4: Add "whiteboard" RecordType to SaveToNotebookModal

**Files:**
- Modify: `web/components/notebook/SaveToNotebookModal.tsx`

- [ ] **Step 1: Extend the RecordType union**

Open `web/components/notebook/SaveToNotebookModal.tsx`. Find `RecordType` (line ~9) and add `"whiteboard"`:

```tsx
type RecordType =
  | "solve"
  | "question"
  | "research"
  | "co_writer"
  | "chat"
  | "guided_learning"
  | "whiteboard";
```

- [ ] **Step 2: Commit**

```bash
git add web/components/notebook/SaveToNotebookModal.tsx
git commit -m "feat: add whiteboard RecordType to SaveToNotebookModal"
```

---

## Task 5: Add i18n keys

**Files:**
- Modify: `web/locales/en/common.json`

- [ ] **Step 1: Add Whiteboard strings**

Open `web/locales/en/common.json` and add:

```json
{
  "language.english": "English",
  "language.chinese": "中文",
  "common.loading": "Loading...",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "whiteboard.title": "Whiteboard",
  "whiteboard.saveToNotebook": "Save to Notebook",
  "whiteboard.export": "Export",
  "whiteboard.aiPanel.title": "AI Assistant",
  "whiteboard.aiPanel.placeholder": "Ask AI to draw or modify...",
  "whiteboard.aiPanel.welcome": "Ask me to generate or modify your diagram. I can use your knowledge base and session context.",
  "whiteboard.canvas.autoSaving": "Auto-saving...",
  "whiteboard.canvas.saved": "Saved just now",
  "whiteboard.canvas.saveFailed": "Save failed — will retry",
  "whiteboard.canvas.loadError": "Failed to load canvas",
  "whiteboard.canvas.retry": "Retry",
  "whiteboard.source.none": "None",
  "whiteboard.source.rag": "Knowledge Base",
  "whiteboard.source.web": "Web"
}
```

- [ ] **Step 2: Verify i18n parity**

```bash
cd web && npm run i18n:check
```

Expected: no missing keys reported.

- [ ] **Step 3: Commit**

```bash
git add web/locales/en/common.json
git commit -m "feat: add Whiteboard i18n keys"
```

---

## Task 6: `useDrawioCanvas` hook

**Files:**
- Create: `web/app/(workspace)/whiteboard/hooks/useDrawioCanvas.ts`

- [ ] **Step 1: Create the hook**

```typescript
// web/app/(workspace)/whiteboard/hooks/useDrawioCanvas.ts
"use client";

import { useCallback, useEffect, useRef } from "react";

export type DrawioEvent =
  | { event: "init" }
  | { event: "load"; xml: string }
  | { event: "change"; xml: string }
  | { event: "export"; data: string; format: string };

interface UseDrawioCanvasOptions {
  onInit?: () => void;
  onChange?: (xml: string) => void;
  onExport?: (data: string, format: string) => void;
}

export function useDrawioCanvas({ onInit, onChange, onExport }: UseDrawioCanvasOptions = {}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const postMessage = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(msg), "*");
  }, []);

  const loadXml = useCallback(
    (xml: string) => {
      postMessage({ action: "load", xml });
    },
    [postMessage],
  );

  const getXml = useCallback(() => {
    postMessage({ action: "export", format: "xml" });
  }, [postMessage]);

  const exportSvg = useCallback(() => {
    postMessage({ action: "export", format: "svg" });
  }, [postMessage]);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      let data: DrawioEvent;
      try {
        data = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
      } catch {
        return;
      }
      if (data.event === "init") onInit?.();
      if (data.event === "change") onChange?.(data.xml);
      if (data.event === "export") onExport?.(data.data, data.format);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onInit, onChange, onExport]);

  return { iframeRef, loadXml, getXml, exportSvg };
}
```

- [ ] **Step 2: Commit**

```bash
git add web/app/\(workspace\)/whiteboard/hooks/useDrawioCanvas.ts
git commit -m "feat: add useDrawioCanvas hook for draw.io postMessage integration"
```

---

## Task 7: `useWhiteboardSession` hook

**Files:**
- Create: `web/app/(workspace)/whiteboard/hooks/useWhiteboardSession.ts`

- [ ] **Step 1: Create the hook**

```typescript
// web/app/(workspace)/whiteboard/hooks/useWhiteboardSession.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useWhiteboardSession(sessionId: string | null) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [initialXml, setInitialXml] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    fetch(apiUrl(`/api/v1/whiteboard/session/${sessionId}`))
      .then((r) => r.json())
      .then((data: { xml: string }) => setInitialXml(data.xml || ""))
      .catch(() => setInitialXml(""));
  }, [sessionId]);

  const saveXml = useCallback(
    (xml: string) => {
      if (!sessionId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setSaveStatus("saving");
        try {
          const res = await fetch(apiUrl(`/api/v1/whiteboard/session/${sessionId}`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ xml }),
          });
          setSaveStatus(res.ok ? "saved" : "error");
          if (res.ok) setTimeout(() => setSaveStatus("idle"), 3000);
        } catch {
          setSaveStatus("error");
        }
      }, 2000);
    },
    [sessionId],
  );

  return { initialXml, saveXml, saveStatus };
}
```

- [ ] **Step 2: Commit**

```bash
git add web/app/\(workspace\)/whiteboard/hooks/useWhiteboardSession.ts
git commit -m "feat: add useWhiteboardSession hook for auto-save/load"
```

---

## Task 8: `DrawioCanvas` component

**Files:**
- Create: `web/app/(workspace)/whiteboard/components/DrawioCanvas.tsx`

- [ ] **Step 1: Create the component**

```tsx
// web/app/(workspace)/whiteboard/components/DrawioCanvas.tsx
"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useTranslation } from "react-i18next";

interface DrawioCanvasProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  saveStatus: "idle" | "saving" | "saved" | "error";
}

function getDrawioUrl(dark: boolean): string {
  const params = new URLSearchParams({
    embed: "1",
    spin: "1",
    modified: "unsavedChanges",
    proto: "json",
    dark: dark ? "1" : "0",
  });
  return `https://embed.diagrams.net/?${params.toString()}`;
}

export function DrawioCanvas({ iframeRef, saveStatus }: DrawioCanvasProps) {
  const { t } = useTranslation();
  const [isDark, setIsDark] = useClientDarkMode();
  const [loadError, setLoadError] = useErrorState();

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {loadError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--muted-foreground)]">
          <p className="text-sm">{t("whiteboard.canvas.loadError")}</p>
          <button
            onClick={() => setLoadError(false)}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm text-[var(--primary-foreground)]"
          >
            {t("whiteboard.canvas.retry")}
          </button>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          src={getDrawioUrl(isDark)}
          className="flex-1 border-0"
          onError={() => setLoadError(true)}
          allow="clipboard-read; clipboard-write"
          title="Whiteboard canvas"
        />
      )}
      <div className="flex h-6 items-center border-t border-[var(--border)] px-3 text-[11px] text-[var(--muted-foreground)]">
        {saveStatus === "saving" && t("whiteboard.canvas.autoSaving")}
        {saveStatus === "saved" && t("whiteboard.canvas.saved")}
        {saveStatus === "error" && t("whiteboard.canvas.saveFailed")}
      </div>
    </div>
  );
}

function useClientDarkMode(): [boolean, (v: boolean) => void] {
  const [isDark, setIsDark] = useStateSafe(() =>
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false,
  );
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    obs.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, [setIsDark]);
  return [isDark, setIsDark];
}

// Minimal helpers to keep the component self-contained
function useStateSafe<T>(init: () => T) {
  const { useState } = require("react") as typeof import("react");
  return useState<T>(init);
}

function useErrorState() {
  const { useState } = require("react") as typeof import("react");
  return useState(false);
}
```

> **Note:** The `useStateSafe` wrapper is a workaround to call `useState` inside a non-hook function. Replace with direct `useState` calls at the component top level — refactor this during implementation.

- [ ] **Step 2: Refactor to proper React hooks at top level**

Replace `useStateSafe`/`useErrorState` inline wrappers with proper `useState` calls at the top of `DrawioCanvas`. Final version:

```tsx
"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";

interface DrawioCanvasProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  saveStatus: "idle" | "saving" | "saved" | "error";
}

function getDrawioUrl(dark: boolean): string {
  const params = new URLSearchParams({
    embed: "1",
    spin: "1",
    modified: "unsavedChanges",
    proto: "json",
    dark: dark ? "1" : "0",
  });
  return `https://embed.diagrams.net/?${params.toString()}`;
}

export function DrawioCanvas({ iframeRef, saveStatus }: DrawioCanvasProps) {
  const { t } = useTranslation();
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false,
  );
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    obs.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {loadError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--muted-foreground)]">
          <p className="text-sm">{t("whiteboard.canvas.loadError")}</p>
          <button
            onClick={() => setLoadError(false)}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm text-[var(--primary-foreground)]"
          >
            {t("whiteboard.canvas.retry")}
          </button>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          src={getDrawioUrl(isDark)}
          className="flex-1 border-0"
          onError={() => setLoadError(true)}
          allow="clipboard-read; clipboard-write"
          title="Whiteboard canvas"
        />
      )}
      <div className="flex h-6 items-center border-t border-[var(--border)] px-3 text-[11px] text-[var(--muted-foreground)]">
        {saveStatus === "saving" && t("whiteboard.canvas.autoSaving")}
        {saveStatus === "saved" && t("whiteboard.canvas.saved")}
        {saveStatus === "error" && t("whiteboard.canvas.saveFailed")}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/app/\(workspace\)/whiteboard/components/DrawioCanvas.tsx
git commit -m "feat: add DrawioCanvas component with theme sync"
```

---

## Task 9: `WhiteboardToolbar` component

**Files:**
- Create: `web/app/(workspace)/whiteboard/components/WhiteboardToolbar.tsx`

- [ ] **Step 1: Create the component**

```tsx
// web/app/(workspace)/whiteboard/components/WhiteboardToolbar.tsx
"use client";

import { Download, Save } from "lucide-react";
import { useTranslation } from "react-i18next";

interface WhiteboardToolbarProps {
  onSaveToNotebook: () => void;
  onExport: () => void;
}

export function WhiteboardToolbar({ onSaveToNotebook, onExport }: WhiteboardToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--secondary)] px-4">
      <span className="text-[13.5px] font-semibold text-[var(--foreground)]">
        {t("whiteboard.title")}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={onSaveToNotebook}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--background)] px-3 py-1.5 text-[12px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
        >
          <Save size={13} />
          {t("whiteboard.saveToNotebook")}
        </button>
        <button
          onClick={onExport}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--background)] px-3 py-1.5 text-[12px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
        >
          <Download size={13} />
          {t("whiteboard.export")}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/app/\(workspace\)/whiteboard/components/WhiteboardToolbar.tsx
git commit -m "feat: add WhiteboardToolbar component"
```

---

## Task 10: `WhiteboardAIPanel` component

**Files:**
- Create: `web/app/(workspace)/whiteboard/components/WhiteboardAIPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
// web/app/(workspace)/whiteboard/components/WhiteboardAIPanel.tsx
"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiUrl } from "@/lib/api";

type SourceOption = "none" | "rag" | "web";
type ToolName = "rag" | "web_search" | "reason";

const TOOL_OPTIONS: Array<{ name: ToolName; label: string }> = [
  { name: "rag", label: "RAG" },
  { name: "web_search", label: "Web Search" },
  { name: "reason", label: "Reason" },
];

const SOURCE_OPTIONS: Array<{ value: SourceOption; label: string; i18nKey: string }> = [
  { value: "none", label: "None", i18nKey: "whiteboard.source.none" },
  { value: "rag", label: "Knowledge Base", i18nKey: "whiteboard.source.rag" },
  { value: "web", label: "Web", i18nKey: "whiteboard.source.web" },
];

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface WhiteboardAIPanelProps {
  sessionId: string | null;
  getCurrentXml: () => void;
  onXmlGenerated: (xml: string) => void;
  pendingXmlRef: React.MutableRefObject<string | null>;
}

export function WhiteboardAIPanel({
  sessionId,
  getCurrentXml,
  onXmlGenerated,
  pendingXmlRef,
}: WhiteboardAIPanelProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: t("whiteboard.aiPanel.welcome") },
  ]);
  const [input, setInput] = useState("");
  const [source, setSource] = useState<SourceOption>("none");
  const [activeTools, setActiveTools] = useState<ToolName[]>(["rag"]);
  const [loading, setLoading] = useState(false);
  const currentXmlRef = useRef("");

  const toggleTool = (tool: ToolName) => {
    setActiveTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool],
    );
  };

  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: prompt }]);
    setLoading(true);

    // Request current XML from draw.io canvas — result arrives via onExport callback
    // which sets pendingXmlRef; we wait briefly for it
    getCurrentXml();
    await new Promise((r) => setTimeout(r, 300));
    const currentXml = pendingXmlRef.current ?? currentXmlRef.current;

    try {
      const res = await fetch(apiUrl("/api/v1/whiteboard/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          current_xml: currentXml,
          session_id: sessionId ?? "",
          source,
          tools: activeTools,
        }),
      });
      const data = (await res.json()) as { xml: string; message: string };
      onXmlGenerated(data.xml);
      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, source, activeTools, sessionId, getCurrentXml, onXmlGenerated, pendingXmlRef]);

  return (
    <div className="flex w-[320px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--background)]">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center border-b border-[var(--border)] bg-[var(--secondary)] px-4">
        <span className="text-[13px] font-semibold text-[var(--foreground)]">
          {t("whiteboard.aiPanel.title")}
        </span>
      </div>

      {/* Messages */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`rounded-lg px-3 py-2 text-[12.5px] ${
              msg.role === "user"
                ? "self-end bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "bg-[var(--muted)] text-[var(--foreground)]"
            }`}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-[12px] text-[var(--muted-foreground)]">
            <Loader2 size={13} className="animate-spin" />
            Generating…
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-[var(--border)] p-3">
        {/* Source selector */}
        <div className="mb-2 flex gap-1">
          {SOURCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSource(opt.value)}
              className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                source === opt.value
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {t(opt.i18nKey)}
            </button>
          ))}
        </div>

        {/* Tool toggles */}
        <div className="mb-2 flex gap-1">
          {TOOL_OPTIONS.map((opt) => (
            <button
              key={opt.name}
              onClick={() => toggleTool(opt.name)}
              className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                activeTools.includes(opt.name)
                  ? "bg-[var(--accent)] font-medium text-[var(--accent-foreground)]"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Text input */}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={t("whiteboard.aiPanel.placeholder")}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[12.5px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
          />
          <button
            onClick={() => void handleSend()}
            disabled={loading || !input.trim()}
            className="rounded-lg bg-[var(--primary)] p-2 text-[var(--primary-foreground)] disabled:opacity-40"
          >
            <ArrowUp size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/app/\(workspace\)/whiteboard/components/WhiteboardAIPanel.tsx
git commit -m "feat: add WhiteboardAIPanel with source selector and tool toggles"
```

---

## Task 11: Main Whiteboard page

**Files:**
- Create: `web/app/(workspace)/whiteboard/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// web/app/(workspace)/whiteboard/page.tsx
"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { useUnifiedChat } from "@/context/UnifiedChatContext";
import { DrawioCanvas } from "./components/DrawioCanvas";
import { WhiteboardAIPanel } from "./components/WhiteboardAIPanel";
import { WhiteboardToolbar } from "./components/WhiteboardToolbar";
import { useDrawioCanvas } from "./hooks/useDrawioCanvas";
import { useWhiteboardSession } from "./hooks/useWhiteboardSession";

const SaveToNotebookModal = dynamic(
  () => import("@/components/notebook/SaveToNotebookModal"),
  { ssr: false },
);

export default function WhiteboardPage() {
  const { selectedSessionId } = useUnifiedChat();
  const pendingXmlRef = useRef<string | null>(null);
  const [notebookPayload, setNotebookPayload] = useState<{
    recordType: "whiteboard";
    title: string;
    userQuery: string;
    output: string;
  } | null>(null);

  const { initialXml, saveXml, saveStatus } = useWhiteboardSession(selectedSessionId);

  const handleChange = useCallback(
    (xml: string) => {
      saveXml(xml);
    },
    [saveXml],
  );

  const handleExport = useCallback((data: string, format: string) => {
    if (format === "xml") {
      pendingXmlRef.current = data;
      return;
    }
    // SVG export triggered by Save to Notebook
    if (format === "svg") {
      setNotebookPayload((prev) =>
        prev ? { ...prev, output: data } : null,
      );
    }
  }, []);

  const { iframeRef, loadXml, getXml, exportSvg } = useDrawioCanvas({
    onInit: () => {
      if (initialXml) loadXml(initialXml);
    },
    onChange: handleChange,
    onExport: handleExport,
  });

  const handleXmlGenerated = useCallback(
    (xml: string) => {
      loadXml(xml);
      saveXml(xml);
    },
    [loadXml, saveXml],
  );

  const handleSaveToNotebook = useCallback(() => {
    setNotebookPayload({
      recordType: "whiteboard",
      title: "Whiteboard Diagram",
      userQuery: "",
      output: "",
    });
    exportSvg();
  }, [exportSvg]);

  const handleExportDownload = useCallback(() => {
    getXml();
  }, [getXml]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--background)]">
      <WhiteboardToolbar
        onSaveToNotebook={handleSaveToNotebook}
        onExport={handleExportDownload}
      />
      <div className="flex flex-1 overflow-hidden">
        <DrawioCanvas iframeRef={iframeRef} saveStatus={saveStatus} />
        <WhiteboardAIPanel
          sessionId={selectedSessionId}
          getCurrentXml={getXml}
          onXmlGenerated={handleXmlGenerated}
          pendingXmlRef={pendingXmlRef}
        />
      </div>
      <SaveToNotebookModal
        open={notebookPayload !== null && notebookPayload.output !== ""}
        payload={notebookPayload}
        onClose={() => setNotebookPayload(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/app/\(workspace\)/whiteboard/page.tsx
git commit -m "feat: add Whiteboard page wiring canvas, AI panel, and toolbar"
```

---

## Task 12: End-to-end smoke test

- [ ] **Step 1: Start backend and frontend**

```bash
# Terminal 1
python deeptutor/api/run_server.py

# Terminal 2
cd web && npm run dev
```

- [ ] **Step 2: Verify the golden path**

1. Open http://localhost:3000
2. Confirm "Whiteboard" appears in the sidebar — click it
3. Confirm draw.io canvas loads (may take a few seconds on first load)
4. Toggle dark mode in DeepTutor settings — confirm draw.io canvas switches to dark
5. In the AI panel, type "Draw a simple flowchart with Start, Process, and End" and press Enter
6. Confirm the diagram appears on the canvas
7. Manually draw a shape on the canvas — confirm "Auto-saving…" then "Saved just now" appears in the status bar
8. Refresh the page — confirm the diagram is restored
9. Click "Save to Notebook" — confirm the SaveToNotebookModal opens

- [ ] **Step 3: Verify source/tool toggles**

1. Enable "Knowledge Base" source and "RAG" tool toggle
2. Type a prompt referencing content from an uploaded document
3. Confirm the AI uses knowledge base context (response should reference document content)

- [ ] **Step 4: Final lint check**

```bash
cd web && npm run lint
ruff check deeptutor/api/routers/whiteboard.py
```

Fix any issues reported.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Whiteboard feature — draw.io canvas with AI panel, auto-save, and notebook export"
```

---

## Self-Review Checklist

| Spec requirement | Covered by task |
|-----------------|----------------|
| `/whiteboard` route in `(workspace)` | Task 11 |
| Sidebar "Whiteboard" entry | Task 3 |
| draw.io iframe canvas | Task 8 |
| Theme sync (dark/light) via URL param + MutationObserver | Task 8 |
| AI chat panel | Task 10 |
| RAG, Web Search, Reason tools (Co-Writer pattern) | Task 10 |
| Source selector (none/rag/web) | Task 10 |
| Auto-save per session (debounced, 2s) | Tasks 7, 11 |
| Save to Notebook button + modal | Tasks 4, 9, 11 |
| Backend generate endpoint | Task 2 |
| Backend session GET/PUT endpoints | Task 1 |
| i18n keys | Task 5 |
| Draw.io postMessage wrapper | Task 6 |
| Error state on canvas load failure | Task 8 |
| Error toast on AI failure | Task 10 |
