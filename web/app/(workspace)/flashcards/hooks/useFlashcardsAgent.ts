"use client";

import {
  useCopilotAdditionalInstructions,
  useCopilotReadable,
  useFrontendTool,
} from "@copilotkit/react-core";
import { useClearCopilotChatOnUnmount } from "@/hooks/useClearCopilotChatOnUnmount";
import type { FlashcardsApi } from "./useFlashcardsState";

const TUTOR_INSTRUCTIONS = `
You are a tutor helping a student review a topic by building a flashcard deck.

The deck is a shared artifact. Build and edit it incrementally with the tools
below — never describe a card in prose when you could create one.

CRITICAL — TOOL CALL FORMAT:
Every tool argument object MUST be FLAT — exactly the keys defined in the tool's
parameters, with primitive string values (or arrays of strings for "tags").
Never wrap them under "card", "args", "input", "params", or any other key.
Never include extra fields like "ok", "created_at", or "updated_at".

Correct examples:
  flashcards_init        → {"topic": "Photosynthesis", "description": "AP Bio Ch. 7"}
  flashcards_add_card    → {"id": "light-rxn", "type": "qa",
                            "front": "What does the light reaction produce?",
                            "back": "ATP and NADPH"}
  flashcards_add_card    → {"id": "calvin-cycle", "type": "cloze",
                            "front": "The Calvin cycle fixes {{CO2}} into G3P.",
                            "back":  "The Calvin cycle fixes CO2 into G3P."}
  flashcards_focus       → {"id": "light-rxn"}

INCORRECT (do not do this):
  {"card": {"id": "x", ...}}                              ← wrapped, will be rejected
  {"args": {...}}                                         ← wrapped
  {"id": "x", "ok": true}                                 ← extra fields

Card types:
- "qa"    — front is a question, back is the answer. Use for definitions, prompts,
            "what is X?", "why does Y happen?"-style cards.
- "cloze" — front is a sentence with one or more "{{...}}" blanks (use double curly
            braces). back is the FULL sentence with the blanks filled in. Keep the
            blanked term short (1–4 words). Use this for fill-in-the-blank style.

Math & code:
- Both "front" and "back" are rendered as Markdown with KaTeX, so use $...$ for
  inline math and $$...$$ for block math, and triple backticks for code.

Workflow:
1. If the deck is empty, call flashcards_init FIRST with the topic (and any
   description the student gave you). Do NOT call init again unless the student
   pivots to a new topic.
2. Generate 6–10 cards in a first pass — a mix of "qa" and "cloze" if the topic
   supports both. Use stable, slug-style ids (e.g., "light-rxn", "calvin-cycle").
3. After the first batch, ask the student a short follow-up: do they want more on
   any sub-topic, harder cards, easier cards, or a specific format.
4. When asked to expand or rewrite cards, use flashcards_update_card or add new
   ones — don't rebuild the whole deck.
5. If the student grades cards as "again" (visible in CURRENT_DECK as
   againCount > 0), offer to rewrite those specific cards more clearly or add
   simpler scaffolding cards.
6. If a tool returns {"ok": false, "error": "..."}, READ the error and retry with
   corrected args on your next turn — do not give up.

Style:
- Be concise. One short paragraph between tool calls, not a wall of text.
- Always say what you just did ("Added 4 cards on the light reaction.") before
  asking the next question.
- The CURRENT_DECK context shows you what's already in the deck — don't add
  duplicates.
- Cards should be atomic: ONE fact per card. Break big questions into smaller ones.
- Front side should be answerable in <10 seconds; back side should be tight
  (definition, formula, 1–2 sentence explanation).
`.trim();

export function useFlashcardsAgent(api: FlashcardsApi) {
  const { state } = api;

  // The CopilotKit provider lives at the workspace layout level, so its chat
  // thread survives navigation by default. We don't want flashcard chat to
  // bleed across page visits (or to other GenUI routes), so wipe it on enter
  // and exit. Mirrors how the deck state itself resets on remount.
  useClearCopilotChatOnUnmount();

  // Compact readable — keep it small even on large decks. The agent only needs ids,
  // type, a truncated front, and the session grade signal to make decisions.
  useCopilotReadable(
    {
      description:
        "CURRENT_DECK — the live flashcard deck the student is studying. Read this on every turn before deciding what to add or edit.",
      value: {
        topic: state.topic,
        description: state.description,
        knowledgeBaseNames: state.knowledgeBaseNames,
        activeId: state.activeId,
        cardCount: state.cardOrder.length,
        cards: state.cardOrder.map((id) => {
          const c = state.cards[id];
          return {
            id: c.id,
            type: c.type,
            // Truncate to keep the prompt small; agent can call back via id if it needs full text.
            front: c.front.length > 140 ? `${c.front.slice(0, 140)}…` : c.front,
            tags: c.tags ?? [],
            knewCount: c.knewCount,
            againCount: c.againCount,
            lastGrade: c.lastGrade ?? null,
          };
        }),
      },
    },
    [state],
  );

  useCopilotAdditionalInstructions({ instructions: TUTOR_INSTRUCTIONS });

  // 7B-class models tend to (a) drop required fields and (b) wrap real args under
  // "card" / "args" / "input" / "params" / "arguments". We unwrap defensively so a
  // single bad call surfaces as a structured error instead of stalling the agent.
  const unwrap = (raw: Record<string, unknown> | undefined | null): Record<string, unknown> => {
    const a = (raw ?? {}) as Record<string, unknown>;
    for (const key of ["card", "args", "input", "params", "arguments"]) {
      const inner = a[key];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        return { ...(inner as Record<string, unknown>), ...a };
      }
    }
    return a;
  };

  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined;

  const strList = (v: unknown): string[] | undefined => {
    if (Array.isArray(v)) {
      const out = v.filter((x): x is string => typeof x === "string" && x.length > 0);
      return out.length ? out : undefined;
    }
    if (typeof v === "string" && v.length > 0) {
      return v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return undefined;
  };

  const fail = (reason: string) => ({ ok: false, error: reason });

  useFrontendTool({
    name: "flashcards_init",
    description:
      "Initialize or update the deck header (topic + optional description + optional knowledge_base_names). Call this once at the start of a session before adding cards. Args MUST be flat: {\"topic\": \"...\", \"description\": \"...\"}.",
    parameters: [
      {
        name: "topic",
        type: "string",
        description: "The high-level topic (e.g., 'Photosynthesis').",
        required: true,
      },
      {
        name: "description",
        type: "string",
        description: "Optional context the student provided (e.g., 'AP Bio Ch. 7, focus on light reactions').",
        required: false,
      },
      {
        name: "knowledge_base_names",
        type: "string[]",
        description: "Optional list of KB names the student wants to source from. Surfaced for context only.",
        required: false,
      },
    ],
    handler: (raw) => {
      const a = unwrap(raw as Record<string, unknown>);
      const topic = str(a.topic);
      if (!topic) return fail("topic is required (a non-empty string)");
      const description = str(a.description);
      const knowledgeBaseNames =
        strList(a.knowledge_base_names) ??
        strList((a as { knowledgeBaseNames?: unknown }).knowledgeBaseNames);
      api.init({ topic, description, knowledgeBaseNames });
      return { ok: true, topic };
    },
  });

  useFrontendTool({
    name: "flashcards_add_card",
    description:
      "Add a single flashcard. type must be 'qa' or 'cloze'. For 'cloze', use {{...}} blanks on the front and the unblanked sentence on the back. Args MUST be flat. Do NOT wrap under a 'card' key.",
    parameters: [
      {
        name: "id",
        type: "string",
        description: "Slug-style id (e.g., 'calvin-cycle'). Optional — auto-generated from front if omitted.",
        required: false,
      },
      {
        name: "type",
        type: "string",
        enum: ["qa", "cloze"],
        description: "Card format. 'qa' = question/answer; 'cloze' = fill-in-the-blank.",
        required: true,
      },
      {
        name: "front",
        type: "string",
        description: "Front side. For qa: the question. For cloze: the sentence with {{blank}} placeholders.",
        required: true,
      },
      {
        name: "back",
        type: "string",
        description: "Back side. For qa: the answer. For cloze: the full sentence with blanks filled in.",
        required: true,
      },
      {
        name: "tags",
        type: "string[]",
        description: "Optional tags / sub-topic labels.",
        required: false,
      },
    ],
    handler: (raw) => {
      const a = unwrap(raw as Record<string, unknown>);
      const type = str(a.type);
      const front = str(a.front);
      const back = str(a.back);
      const id = str(a.id);
      if (!type || (type !== "qa" && type !== "cloze")) {
        return fail("type is required and must be 'qa' or 'cloze'");
      }
      if (!front) return fail("front is required (a non-empty string)");
      if (!back) return fail("back is required (a non-empty string)");
      try {
        const actualId = api.addCard({
          id,
          type: type as "qa" | "cloze",
          front,
          back,
          tags: strList(a.tags),
        });
        return { ok: true, id: actualId };
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  useFrontendTool({
    name: "flashcards_update_card",
    description:
      "Edit an existing card's front, back, or tags without re-adding it. Args MUST be flat.",
    parameters: [
      { name: "id", type: "string", description: "Id of the card to update.", required: true },
      { name: "front", type: "string", description: "New front text.", required: false },
      { name: "back", type: "string", description: "New back text.", required: false },
      {
        name: "tags",
        type: "string[]",
        description: "Replacement tags (overwrites — does not merge).",
        required: false,
      },
    ],
    handler: (raw) => {
      const a = unwrap(raw as Record<string, unknown>);
      const id = str(a.id);
      if (!id) return fail("id is required (a non-empty string)");
      api.updateCard({
        id,
        front: str(a.front),
        back: str(a.back),
        tags: strList(a.tags),
      });
      return { ok: true, id };
    },
  });

  useFrontendTool({
    name: "flashcards_remove_card",
    description: "Delete a card by id. Args MUST be flat: {\"id\": \"...\"}.",
    parameters: [
      { name: "id", type: "string", description: "Id of the card to delete.", required: true },
    ],
    handler: (raw) => {
      const a = unwrap(raw as Record<string, unknown>);
      const id = str(a.id);
      if (!id) return fail("id is required");
      api.removeCard({ id });
      return { ok: true, id };
    },
  });

  useFrontendTool({
    name: "flashcards_focus",
    description: "Bring a specific card to the front of the deck (selects it for the student). Args MUST be flat.",
    parameters: [
      { name: "id", type: "string", description: "Id of the card to focus.", required: true },
    ],
    handler: (raw) => {
      const a = unwrap(raw as Record<string, unknown>);
      const id = str(a.id);
      if (!id) return fail("id is required");
      api.focusCard({ id });
      return { ok: true, id };
    },
  });

  useFrontendTool({
    name: "flashcards_clear",
    description: "Remove every card in the deck while keeping the topic header. Use only if the student explicitly asks to start over.",
    parameters: [],
    handler: () => {
      api.clear();
      return { ok: true };
    },
  });
}
