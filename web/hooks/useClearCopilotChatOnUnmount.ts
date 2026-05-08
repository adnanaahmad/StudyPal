"use client";

import { useLayoutEffect, useMemo } from "react";
import { useAgent } from "@copilotkit/react-core/v2";

/**
 * Wipe the CopilotKit chat history when the calling route mounts and unmounts.
 *
 * The `CopilotKit` provider lives at the workspace layout level, so its
 * underlying ag-ui agent — and therefore its `messages` array — survives
 * page navigation. For session-only, tool-scoped pages (mindmap, flashcards)
 * the previous deck's chat is no longer relevant when the user comes back,
 * so we drop it on both enter and exit. This keeps the page-local agent
 * context (deck, map) and the visible chat history aligned.
 *
 * Why this is non-trivial:
 * - `CopilotSidebar` (via `useCopilotChatInternal`) calls
 *   `copilotkit.connectAgent({ agent })` whenever the chat component remounts
 *   on the same shared singleton agent. With Next.js soft navigation the
 *   layout-level `<CopilotKit>` provider stays mounted, so the agent persists
 *   across routes — and on remount the connect handshake can re-populate
 *   `agent.messages` from the runtime's view of that thread, undoing a plain
 *   `setMessages([])`.
 * - The reliable break is to change `agent.threadId` to a fresh value before
 *   clearing messages. The next `connectAgent` lands on a brand-new thread,
 *   so there is nothing to restore. This mirrors what the v2 `<CopilotChat>`
 *   itself does with its `threadId` prop (see `agent.threadId = ...` in
 *   `@copilotkit/react-core/v2`).
 *
 * Call this exactly once per route, alongside the route's tool registrations.
 */

function makeThreadId(): string {
  // Prefer the platform RNG when available (browser & modern node);
  // fall back to a Math.random hex for older runtimes / SSR.
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `thread-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useClearCopilotChatOnUnmount() {
  const { agent } = useAgent();

  // useLayoutEffect so this runs before child passive effects. `CopilotSidebar`
  // calls `connectAgent` in a `useEffect`; if we only cleared messages in the
  // same phase after the child, the connect handshake could replay the prior
  // thread before our `threadId` rotation took effect.
  useLayoutEffect(() => {
    if (!agent) return;

    const reset = () => {
      try {
        // Order matters:
        //   1) move the agent onto a fresh thread so the next connect handshake
        //      can't restore the previous conversation, then
        //   2) wipe in-memory messages, then
        //   3) wipe co-agent state (mirrors CopilotKit's internal `reset()`).
        //
        // Mutating `agent.threadId` is intentional and mirrors what
        // `<CopilotChat>` itself does internally — see
        // `agent.threadId = resolvedThreadId` in @copilotkit/react-core/v2.
        // eslint-disable-next-line react-hooks/immutability
        agent.threadId = makeThreadId();
        agent.setMessages([]);
        try {
          agent.setState(null);
        } catch {
          // setState may be a no-op on some agent variants — ignore.
        }
      } catch {
        // Defensive: never throw from a cleanup function.
      }
    };

    reset();
    return reset;
  }, [agent]);
}

/** One id per workspace tool page mount — pass as `key` on `CopilotSidebar`. */
export function useCopilotSidebarSessionKey(): string {
  return useMemo(() => makeThreadId(), []);
}
