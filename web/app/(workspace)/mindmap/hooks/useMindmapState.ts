"use client";

import { useCallback, useMemo, useRef, useState } from "react";

export type NodeStatus = "known" | "learning" | "weak" | "unsure";

export interface MindmapNode {
  id: string;
  label: string;
  parentId: string | null;
  brief?: string;
  color?: string;
  status?: NodeStatus;
  notes?: string[];
}

export interface MindmapState {
  rootId: string | null;
  topic: string | null;
  nodes: Record<string, MindmapNode>;
  childrenOrder: Record<string, string[]>;
  focusedId: string | null;
}

const EMPTY_STATE: MindmapState = {
  rootId: null,
  topic: null,
  nodes: {},
  childrenOrder: {},
  focusedId: null,
};

const STATUS_COLOR: Record<NodeStatus, string> = {
  known: "#22c55e",
  learning: "#3b82f6",
  weak: "#f59e0b",
  unsure: "#a855f7",
};

const slugify = (s: string | null | undefined): string => {
  const input = (s ?? "").toString();
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || `node-${Math.random().toString(36).slice(2, 7)}`
  );
};

const normalizeLabel = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, " ");

// Render a node label as Markdown with optional color/status decoration.
// Markmap reads inline HTML, so we wrap colored text in <span style="color:...">.
const renderLabel = (n: MindmapNode): string => {
  const color = n.color ?? (n.status ? STATUS_COLOR[n.status] : undefined);
  const badge = n.status ? ` _(${n.status})_` : "";
  const safeLabel = n.label.replace(/[<>]/g, "");
  if (color) return `<span style="color:${color}">${safeLabel}</span>${badge}`;
  return `${safeLabel}${badge}`;
};

/**
 * Convert MindmapState into the Markdown that <MindmapCanvas /> already consumes.
 * Tree-shaped: each node becomes a heading whose level mirrors its depth.
 */
export const stateToMarkmap = (state: MindmapState): string => {
  if (!state.rootId) return "";
  const lines: string[] = [];
  const visit = (id: string, depth: number) => {
    const node = state.nodes[id];
    if (!node) return;
    const hashes = "#".repeat(Math.min(depth + 1, 6));
    lines.push(`${hashes} ${renderLabel(node)}`);
    if (node.brief) lines.push("", node.brief, "");
    if (node.notes?.length) {
      for (const note of node.notes) lines.push(`- ${note}`);
    }
    const children = state.childrenOrder[id] ?? [];
    for (const childId of children) visit(childId, depth + 1);
  };
  visit(state.rootId, 0);
  return lines.join("\n");
};

export interface MindmapApi {
  state: MindmapState;
  markdown: string;
  init: (args: { topic: string; rootLabel: string }) => string;
  addNode: (args: {
    id?: string;
    label: string;
    parentId: string;
    brief?: string;
    color?: string;
  }) => string;
  updateNode: (args: {
    id: string;
    label?: string;
    brief?: string;
    color?: string;
  }) => void;
  removeNode: (args: { id: string }) => void;
  markNode: (args: { id: string; status: NodeStatus }) => void;
  addNote: (args: { id: string; text: string }) => void;
  focusNode: (args: { id: string }) => void;
  reset: () => void;
}

export function useMindmapState(): MindmapApi {
  const [state, setState] = useState<MindmapState>(EMPTY_STATE);

  // Keep a ref so tool handlers always read the freshest state when scheduled
  // back-to-back by the agent (avoids stale-closure bugs on rapid add_node).
  const stateRef = useRef(state);
  stateRef.current = state;

  const ensureUniqueId = (desired: string): string => {
    let candidate = slugify(desired);
    let n = 2;
    while (stateRef.current.nodes[candidate]) {
      candidate = `${slugify(desired)}-${n++}`;
    }
    return candidate;
  };

  const findSiblingByLabel = (
    parentId: string,
    label: string,
    excludeId?: string,
  ): string | null => {
    const normalized = normalizeLabel(label);
    if (!normalized) return null;
    const siblings = stateRef.current.childrenOrder[parentId] ?? [];
    for (const siblingId of siblings) {
      if (excludeId && siblingId === excludeId) continue;
      const sibling = stateRef.current.nodes[siblingId];
      if (!sibling) continue;
      if (normalizeLabel(sibling.label) === normalized) return siblingId;
    }
    return null;
  };

  const init: MindmapApi["init"] = useCallback(({ topic, rootLabel }) => {
    const id = "root";
    const next: MindmapState = {
      rootId: id,
      topic,
      nodes: { [id]: { id, label: rootLabel, parentId: null } },
      childrenOrder: { [id]: [] },
      focusedId: id,
    };
    stateRef.current = next;
    setState(next);
    return id;
  }, []);

  const addNode: MindmapApi["addNode"] = useCallback((args) => {
    const parentId =
      args.parentId === "root" || args.parentId === ""
        ? stateRef.current.rootId ?? "root"
        : args.parentId;
    if (!stateRef.current.nodes[parentId]) {
      return ensureUniqueId(args.id ?? args.label);
    }
    const existingId = findSiblingByLabel(parentId, args.label);
    if (existingId) {
      setState((prev) => {
        const next: MindmapState = { ...prev, focusedId: existingId };
        stateRef.current = next;
        return next;
      });
      return existingId;
    }
    const id = ensureUniqueId(args.id ?? args.label);
    setState((prev) => {
      if (!prev.nodes[parentId]) return prev;
      const node: MindmapNode = {
        id,
        label: args.label,
        parentId,
        brief: args.brief,
        color: args.color,
      };
      const next: MindmapState = {
        ...prev,
        nodes: { ...prev.nodes, [id]: node },
        childrenOrder: {
          ...prev.childrenOrder,
          [parentId]: [...(prev.childrenOrder[parentId] ?? []), id],
          [id]: [],
        },
        focusedId: id,
      };
      stateRef.current = next;
      return next;
    });
    return id;
  }, []);

  const updateNode: MindmapApi["updateNode"] = useCallback(({ id, label, brief, color }) => {
    if (label) {
      const existing = stateRef.current.nodes[id];
      if (existing?.parentId) {
        const duplicateId = findSiblingByLabel(existing.parentId, label, id);
        if (duplicateId) {
          setState((prev) => {
            const next: MindmapState = { ...prev, focusedId: duplicateId };
            stateRef.current = next;
            return next;
          });
          return;
        }
      }
    }
    setState((prev) => {
      const existing = prev.nodes[id];
      if (!existing) return prev;
      const next: MindmapState = {
        ...prev,
        nodes: {
          ...prev.nodes,
          [id]: {
            ...existing,
            ...(label !== undefined ? { label } : {}),
            ...(brief !== undefined ? { brief } : {}),
            ...(color !== undefined ? { color } : {}),
          },
        },
      };
      stateRef.current = next;
      return next;
    });
  }, []);

  const removeNode: MindmapApi["removeNode"] = useCallback(({ id }) => {
    setState((prev) => {
      if (!prev.nodes[id] || id === prev.rootId) return prev;
      const toDelete = new Set<string>();
      const collect = (cur: string) => {
        toDelete.add(cur);
        for (const child of prev.childrenOrder[cur] ?? []) collect(child);
      };
      collect(id);

      const nodes = { ...prev.nodes };
      const childrenOrder = { ...prev.childrenOrder };
      for (const d of toDelete) {
        delete nodes[d];
        delete childrenOrder[d];
      }
      const parent = prev.nodes[id]?.parentId;
      if (parent && childrenOrder[parent]) {
        childrenOrder[parent] = childrenOrder[parent].filter((c) => c !== id);
      }
      const next: MindmapState = {
        ...prev,
        nodes,
        childrenOrder,
        focusedId: prev.focusedId && toDelete.has(prev.focusedId) ? prev.rootId : prev.focusedId,
      };
      stateRef.current = next;
      return next;
    });
  }, []);

  const markNode: MindmapApi["markNode"] = useCallback(({ id, status }) => {
    setState((prev) => {
      const existing = prev.nodes[id];
      if (!existing) return prev;
      const next: MindmapState = {
        ...prev,
        nodes: { ...prev.nodes, [id]: { ...existing, status } },
      };
      stateRef.current = next;
      return next;
    });
  }, []);

  const addNote: MindmapApi["addNote"] = useCallback(({ id, text }) => {
    setState((prev) => {
      const existing = prev.nodes[id];
      if (!existing) return prev;
      const next: MindmapState = {
        ...prev,
        nodes: {
          ...prev.nodes,
          [id]: { ...existing, notes: [...(existing.notes ?? []), text] },
        },
      };
      stateRef.current = next;
      return next;
    });
  }, []);

  const focusNode: MindmapApi["focusNode"] = useCallback(({ id }) => {
    setState((prev) => {
      if (!prev.nodes[id]) return prev;
      const next = { ...prev, focusedId: id };
      stateRef.current = next;
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    stateRef.current = EMPTY_STATE;
    setState(EMPTY_STATE);
  }, []);

  const markdown = useMemo(() => stateToMarkmap(state), [state]);

  return {
    state,
    markdown,
    init,
    addNode,
    updateNode,
    removeNode,
    markNode,
    addNote,
    focusNode,
    reset,
  };
}
