"use client";

import { useCopilotAdditionalInstructions, useCopilotReadable, useFrontendTool } from "@copilotkit/react-core";
import { useClearCopilotChatOnUnmount } from "@/hooks/useClearCopilotChatOnUnmount";
import type { MindmapApi } from "./useMindmapState";

const TUTOR_INSTRUCTIONS = `
You are a tutor assisting a student building a concept map about a topic of their choice.

The mind map is a shared whiteboard between you and the student. Build it incrementally
using the tools below — never describe nodes in prose when you could create them.

CRITICAL — TOOL CALL FORMAT:
Every tool argument object MUST be FLAT — exactly the keys defined in the tool's
parameters, with primitive string values.

NEVER batch tool calls into arrays. If you need to add 3 nodes, you MUST call the
concept_map_add_node tool 3 separate times.
NEVER wrap arguments under "nodes" (plural), "node", "args", "input", "params",
or any other key. Never include extra keys like "ok", "children", "created_at",
"updated_at".

Correct examples:
  concept_map_init        → {"topic": "Linear Algebra", "root_label": "Linear Algebra"}
  concept_map_add_node    → {"id": "vectors", "label": "Vectors", "parent_id": "root"}
  concept_map_mark        → {"id": "eigenvalues", "status": "weak"}
  concept_map_focus       → {"id": "vectors"}

INCORRECT (do not do this):
  {"node": {"id": "vectors", "label": "Vectors"}}     ← wrapped, will be rejected
  {"args": {"id": "vectors"}}                         ← wrapped
  {"id": "vectors", "ok": true, "children": []}       ← extra fields

Workflow:
1. If the map is empty, call concept_map_init FIRST. The root id is always "root".
2. Add 3-5 top-level branches with concept_map_add_node, parent_id: "root".
   Choose stable, slug-style ids (e.g., "vectors", "eigenvalues") — they're how you refer
   to nodes later.
3. For each branch, ask the student a brief follow-up ("how deep should we go on X?")
   before drilling further. Don't dump a 50-node tree in one shot.
4. When the student asks to expand a branch, call concept_map_add_node with that branch's
   id as parent_id, adding 2-4 children at most.
5. When the student says they understand, call concept_map_mark with status: "known".
   When shaky, status: "weak". Use "learning" for things you've just covered together.
6. Use concept_map_focus to draw attention to a specific node.
7. Use concept_map_note for short definitions/formulas/examples (under 200 chars).
8. If a tool returns {"ok": false, "error": "..."}, READ the error and retry with
   corrected args on your next turn — do not give up.

Style:
- Be concise. One short paragraph between tool calls, not a wall of text.
- Always say what you just did ("Added 'Eigenvalues' under 'Linear Algebra'.") before
  asking the next question.
- The CURRENT_MAP context shows you what's already on the canvas — don't add duplicates.
- For definitions/examples, prefer concept_map_note (do not try to store definitions in node fields).
`.trim();

/**
 * Registers the mindmap tool vocabulary with CopilotKit and exposes the live state
 * to the agent via useCopilotReadable.
 *
 * Call from inside the mindmap page only — tools and readables auto-deregister
 * when the page unmounts, keeping the agent's tool list route-aware.
 */
export function useMindmapAgent(api: MindmapApi) {
  const { state } = api;

  // The CopilotKit provider lives at the workspace layout level, so its chat
  // thread survives navigation by default. The mindmap state itself resets on
  // remount, so wipe the chat alongside it — no orphan turns referencing a
  // map that no longer exists.
  useClearCopilotChatOnUnmount();

  // Make the live map visible to the agent on every turn so it doesn't add duplicate
  // nodes or refer to ids that no longer exist.
  useCopilotReadable({
    description: "CURRENT_MAP — the live concept map the student is building. Read this on every turn before deciding what to add.",
    value: {
      topic: state.topic,
      rootId: state.rootId,
      focusedId: state.focusedId,
      nodes: Object.values(state.nodes).map((n) => ({
        id: n.id,
        label: n.label,
        parentId: n.parentId,
        status: n.status ?? null,
        hasNotes: (n.notes?.length ?? 0) > 0,
      })),
    },
  }, [state]);

  useCopilotAdditionalInstructions({ instructions: TUTOR_INSTRUCTIONS });

  // 7B-class models do two annoying things at tool-call time:
  //   (1) drop required fields,
  //   (2) wrap the real args under "node", "args", "input", "params", or
  //       "arguments" — they pattern-match on shapes they've seen before.
  // We unwrap defensively so a single malformed call doesn't halt the agent;
  // missing fields surface as a structured `{ ok: false, error }` instead of a
  // thrown exception, which lets the agent self-correct on the next turn.
  const unwrap = (raw: Record<string, unknown> | undefined | null): Record<string, unknown> => {
    const a = (raw ?? {}) as Record<string, unknown>;
    for (const key of ["node", "args", "input", "params", "arguments"]) {
      const inner = a[key];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        return { ...(inner as Record<string, unknown>), ...a };
      }
    }
    return a;
  };

  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined;

  const fail = (reason: string) => ({ ok: false, error: reason });

  useFrontendTool({
    name: "concept_map_init",
    description: "Start a fresh concept map. Call this once at the beginning of a session before adding any nodes. The root node's id will always be 'root'. Args MUST be flat: {\"topic\": \"...\", \"root_label\": \"...\"}.",
    parameters: [
      { name: "topic", type: "string", description: "The high-level topic of the map (e.g., 'Linear Algebra').", required: true },
      { name: "root_label", type: "string", description: "Display label for the root node — usually the topic itself or a short rephrasing.", required: true },
    ],
    handler: (raw) => {
      const a = unwrap(raw as Record<string, unknown>);
      const topic = str(a.topic);
      const root_label = str(a.root_label) ?? str((a as { rootLabel?: unknown }).rootLabel);
      if (!topic) return fail("topic is required (a non-empty string)");
      if (!root_label) return fail("root_label is required (a non-empty string)");
      const id = api.init({ topic, rootLabel: root_label });
      return { id };
    },
  });

  useFrontendTool({
    name: "concept_map_add_node",
    description: "Add a single node under a parent. Use 'root' for parent_id to add a top-level branch. Args MUST be flat: {\"id\": \"...\", \"label\": \"...\", \"parent_id\": \"...\"}. Do NOT wrap under a 'node' key.",
    parameters: [
      { name: "id", type: "string", description: "Slug-style id (e.g., 'eigenvalues'). Must be unique within the map.", required: true },
      { name: "label", type: "string", description: "Display label for the node.", required: true },
      { name: "parent_id", type: "string", description: "Id of the parent node. Use 'root' for top-level branches.", required: true },
      { name: "color", type: "string", description: "Optional CSS color (e.g., '#3b82f6'). Skip unless asked.", required: false },
    ],
    handler: (raw) => {
      const a = unwrap(raw as Record<string, unknown>);
      const id = str(a.id);
      const label = str(a.label);
      const parent_id =
        str(a.parent_id) ?? str((a as { parentId?: unknown }).parentId);
      const color = str(a.color);
      if (!label) return fail("label is required (a non-empty string)");
      if (!parent_id) return fail("parent_id is required (use 'root' for top-level branches)");
      const actualId = api.addNode({ id: id ?? label, label, parentId: parent_id, color });
      return { id: actualId };
    },
  });

  useFrontendTool({
    name: "concept_map_update_node",
    description: "Rename, recolor, or re-annotate an existing node without re-adding it. Args MUST be flat.",
    parameters: [
      { name: "id", type: "string", description: "Id of the node to update.", required: true },
      { name: "label", type: "string", description: "New display label.", required: false },
      { name: "color", type: "string", description: "New CSS color.", required: false },
    ],
    handler: (raw) => {
      const a = unwrap(raw as Record<string, unknown>);
      const id = str(a.id);
      if (!id) return fail("id is required (a non-empty string)");
      api.updateNode({ id, label: str(a.label), color: str(a.color) });
      return { id };
    },
  });

  useFrontendTool({
    name: "concept_map_remove_node",
    description: "Delete a node and all its children. Cannot remove the root. Args MUST be flat: {\"id\": \"...\"}.",
    parameters: [
      { name: "id", type: "string", description: "Id of the node to delete.", required: true },
    ],
    handler: (raw) => {
      const a = unwrap(raw as Record<string, unknown>);
      const id = str(a.id);
      if (!id) return fail("id is required (a non-empty string)");
      api.removeNode({ id });
      return { id };
    },
  });

  useFrontendTool({
    name: "concept_map_mark",
    description: "Tag a node with the student's current understanding level. Drives node color: known=green, learning=blue, weak=amber, unsure=purple. Args MUST be flat.",
    parameters: [
      { name: "id", type: "string", description: "Id of the node.", required: true },
      { name: "status", type: "string", enum: ["known", "learning", "weak", "unsure"], description: "Mastery status.", required: true },
    ],
    handler: (raw) => {
      const a = unwrap(raw as Record<string, unknown>);
      const id = str(a.id);
      const status = str(a.status);
      if (!id) return fail("id is required");
      if (!status || !["known", "learning", "weak", "unsure"].includes(status)) {
        return fail("status must be one of: known, learning, weak, unsure");
      }
      api.markNode({ id, status: status as "known" | "learning" | "weak" | "unsure" });
      return { id, status };
    },
  });

  useFrontendTool({
    name: "concept_map_note",
    description: "Attach a longer note (definition, formula, example) to a node. Keep under 200 characters. Args MUST be flat.",
    parameters: [
      { name: "id", type: "string", description: "Id of the node.", required: true },
      { name: "text", type: "string", description: "Note content.", required: true },
    ],
    handler: (raw) => {
      const a = unwrap(raw as Record<string, unknown>);
      const id = str(a.id);
      const text = str(a.text);
      if (!id) return fail("id is required");
      if (!text) return fail("text is required");
      api.addNote({ id, text });
      return { id };
    },
  });

  useFrontendTool({
    name: "concept_map_focus",
    description: "Pan/zoom the canvas to highlight a specific node. Args MUST be flat: {\"id\": \"...\"}.",
    parameters: [
      { name: "id", type: "string", description: "Id of the node to focus.", required: true },
    ],
    handler: (raw) => {
      const a = unwrap(raw as Record<string, unknown>);
      const id = str(a.id);
      if (!id) return fail("id is required");
      api.focusNode({ id });
      return { id };
    },
  });
}
