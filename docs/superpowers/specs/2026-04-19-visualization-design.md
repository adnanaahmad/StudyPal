# Whiteboard Feature — Design Spec

**Date:** 2026-04-19  
**Status:** Approved for implementation

---

## Overview

Add a **Whiteboard** page to DeepTutor that gives users a full draw.io diagramming canvas with a side-by-side AI chat panel. The AI can generate and modify diagrams using configurable tools (RAG, Web Search, Reason) and the current session context. Diagrams auto-save per session and can be explicitly saved to the user's notebook.

---

## Architecture

### Source integration strategy

Copy and adapt the [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io) source code directly into the DeepTutor repo. This gives full control over theming (DeepTutor CSS variables applied natively) and avoids iframe cross-origin issues when persisting diagram state to the backend.

The draw.io canvas itself remains as an embedded iframe (draw.io's own embed URL), controlled via the draw.io postMessage API. The next-ai-draw-io codebase provides the postMessage wrapper and AI integration patterns to copy from.

### Route

`/whiteboard` — added to the `(workspace)` route group alongside `/co-writer`, `/guide`, `/agents`.

### Components

```
web/app/(workspace)/whiteboard/
  page.tsx                   # Main page: canvas + AI panel split layout
  hooks/
    useDrawioCanvas.ts       # Manages draw.io iframe postMessage communication
    useWhiteboardSession.ts  # Auto-save/load diagram XML per session
  components/
    WhiteboardToolbar.tsx    # Top bar: title, Save to Notebook, Export buttons
    DrawioCanvas.tsx         # draw.io iframe wrapper with theme-aware URL params
    WhiteboardAIPanel.tsx    # Right-side AI chat panel (input + message thread + tool toggles)
```

### Sidebar entry

Add to `PRIMARY_NAV` in `web/components/sidebar/SidebarShell.tsx`:

```ts
{ href: "/whiteboard", label: "Whiteboard", icon: PenSquare }
```

`PenSquare` from lucide-react. Positioned after "Guided Learning", before "Knowledge".

---

## Layout

Two-zone split within the workspace main area (sidebar is already handled by the layout):

| Zone | Width | Content |
|------|-------|---------|
| Canvas | `flex-1` | draw.io iframe, auto-resizes |
| AI Panel | `320px` fixed | Chat thread + input + tool toggles |

Toolbar spans the full width above both zones (height `40px`).

---

## Theming

DeepTutor uses CSS custom properties (`--background`, `--foreground`, `--primary`, `--border`, `--secondary`, etc.) with automatic light/dark switching via the `.dark` class on `<html>`.

- **draw.io iframe** — pass `&dark=1` or `&dark=0` as a URL param based on the current theme. Detect theme by reading `document.documentElement.classList.contains('dark')` and watch for changes via `MutationObserver`.
- **AI panel and toolbar** — use DeepTutor CSS variables directly (Tailwind `bg-[var(--secondary)]`, `text-[var(--foreground)]`, etc.), same pattern as `SidebarShell` and Co-Writer.

---

## AI Integration

### Tools

Reuse the exact tool set and pill-toggle UI pattern from Co-Writer (`ToolName` type, `TOOL_OPTIONS` array, toggle logic). The following tools are available in the Whiteboard AI panel:

| Tool | Label | Default |
|------|-------|---------|
| `rag` | RAG | on |
| `web_search` | Web Search | off |
| `reason` | Reason | off |

`brainstorm`, `code_execution`, and `paper_search` are excluded — not applicable to diagram generation.

The tool toggle pills render identically to Co-Writer's selection popover tool toggles. No new UI component needed — extract the pill toggle into a shared component if it isn't already, or copy the pattern directly.

### Source selector

Reuse Co-Writer's `SourceOption` type (`"none" | "rag" | "web"`) for the primary source selector in the AI panel input area. The source selector and tool toggles together determine what context the AI uses:

- **Source** — where the AI retrieves context from (none / knowledge base / web)
- **Tool toggles** — which reasoning tools the AI can invoke (RAG, Web Search, Reason)

### Endpoint

New API route:

`POST /api/v1/whiteboard/generate`

Request body:
```json
{
  "prompt": "user message",
  "current_xml": "current draw.io XML string",
  "session_id": "...",
  "source": "rag",
  "knowledge_base_id": "...",
  "tools": ["rag", "reason"]
}
```

Response:
```json
{
  "xml": "updated draw.io XML",
  "message": "AI explanation text"
}
```

The backend calls Claude via `deeptutor.services.llm` with a system prompt instructing it to output valid draw.io XML. It runs the selected tools (RAG retrieval, web search, reasoning chain) before generating the diagram XML.

---

## Persistence

### Auto-save (per session)

- On every diagram change (draw.io fires `change` postMessage events), debounce 2s then save the XML to: `PUT /api/v1/whiteboard/session/{session_id}`
- On page load, `GET /api/v1/whiteboard/session/{session_id}` to restore the last diagram
- Status indicator in the canvas footer: "Auto-saving…" / "Saved just now"

### Save to Notebook

- Toolbar "Save to Notebook" button opens the existing `SaveToNotebookModal` component
- Passes the diagram as an SVG export (draw.io postMessage `export` command) + the raw XML

---

## Backend changes

### New FastAPI router: `deeptutor/api/routers/whiteboard.py`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/whiteboard/generate` | AI diagram generation/modification |
| `GET` | `/api/v1/whiteboard/session/{session_id}` | Load saved diagram XML |
| `PUT` | `/api/v1/whiteboard/session/{session_id}` | Save diagram XML |

Register router in `deeptutor/api/main.py` following the same pattern as existing routers.

### Storage

Diagram XML stored in the existing session/runtime layer (`deeptutor/runtime/`). No new database tables required — stored as a session metadata field.

---

## Error handling

- draw.io iframe fails to load → show inline error with retry button
- AI generation fails → show error toast in the chat panel, diagram unchanged
- Auto-save fails → show "Save failed" status, retry automatically on next change

---

## i18n

Add new keys to `web/locales/en/` for all user-visible strings in the Whiteboard feature. Run `npm run i18n:check` after.

---

## Out of scope

- Real-time collaboration (multiplayer editing)
- Diagram history/versioning beyond the current session
- Custom shape libraries
- Embedding diagrams into Co-Writer (future integration point)
