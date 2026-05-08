"use client";

import { useCallback, useMemo, useState } from "react";

export type CardType = "qa" | "cloze";
export type CardGrade = "knew" | "again";

export interface Flashcard {
  id: string;
  type: CardType;
  /**
   * For "qa": the question / prompt.
   * For "cloze": the cue sentence with one or more "{{blank}}" placeholders.
   */
  front: string;
  /**
   * For "qa": the answer / explanation.
   * For "cloze": the full sentence with the blanks filled in (the "answer key").
   */
  back: string;
  tags?: string[];
  // Session-only review stats — reset on page reload by design.
  knewCount: number;
  againCount: number;
  lastGrade?: CardGrade;
}

export interface FlashcardsState {
  topic: string | null;
  description: string | null;
  /** Names of KBs the student selected; surfaced to the agent as soft context only. */
  knowledgeBaseNames: string[];
  cards: Record<string, Flashcard>;
  /** Stable order in which cards appear in the deck strip. */
  cardOrder: string[];
  activeId: string | null;
  flipped: boolean;
}

const EMPTY_STATE: FlashcardsState = {
  topic: null,
  description: null,
  knowledgeBaseNames: [],
  cards: {},
  cardOrder: [],
  activeId: null,
  flipped: false,
};

const slugify = (s: string | null | undefined): string => {
  const input = (s ?? "").toString();
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || `card-${Math.random().toString(36).slice(2, 7)}`
  );
};

const VALID_TYPES: ReadonlySet<CardType> = new Set(["qa", "cloze"]);

export interface FlashcardsApi {
  state: FlashcardsState;
  /**
   * Initialize / replace the deck header. Does NOT clear existing cards by default —
   * the agent uses `clear` for that. This makes "add KB to existing deck" trivial.
   */
  init: (args: {
    topic: string;
    description?: string;
    knowledgeBaseNames?: string[];
  }) => void;
  addCard: (args: {
    id?: string;
    type: CardType;
    front: string;
    back: string;
    tags?: string[];
  }) => string;
  updateCard: (args: {
    id: string;
    front?: string;
    back?: string;
    tags?: string[];
  }) => void;
  removeCard: (args: { id: string }) => void;
  focusCard: (args: { id: string }) => void;
  // UI-only mutators — never exposed as agent tools.
  setFlipped: (flipped: boolean) => void;
  next: () => void;
  prev: () => void;
  gradeActive: (grade: CardGrade) => void;
  clear: () => void;
  reset: () => void;
}

/**
 * Resolve a desired id to one that is unique within the supplied cards map.
 * Run inside setState so the freshest committed-or-pending state is used —
 * this is what lets back-to-back agent calls in a single turn coexist without
 * id collisions, without needing a ref read during render.
 */
const resolveUniqueId = (
  desired: string,
  existing: Record<string, Flashcard>,
): string => {
  let candidate = slugify(desired);
  let n = 2;
  while (existing[candidate]) {
    candidate = `${slugify(desired)}-${n++}`;
  }
  return candidate;
};

export function useFlashcardsState(): FlashcardsApi {
  const [state, setState] = useState<FlashcardsState>(EMPTY_STATE);

  const init: FlashcardsApi["init"] = useCallback(
    ({ topic, description, knowledgeBaseNames }) => {
      setState((prev) => ({
        ...prev,
        topic,
        description: description ?? null,
        knowledgeBaseNames: knowledgeBaseNames ?? prev.knowledgeBaseNames,
      }));
    },
    [],
  );

  // addCard returns the actual id chosen. Because uniqueness has to run against
  // the latest state, we resolve inside the updater. We also need to surface the
  // chosen id back to the caller (for tool return values) — capture it via a
  // sentinel that the updater writes to.
  const addCard: FlashcardsApi["addCard"] = useCallback((args) => {
    let chosenId = "";
    setState((prev) => {
      chosenId = resolveUniqueId(args.id ?? args.front, prev.cards);
      const card: Flashcard = {
        id: chosenId,
        type: args.type,
        front: args.front,
        back: args.back,
        tags: args.tags,
        knewCount: 0,
        againCount: 0,
      };
      return {
        ...prev,
        cards: { ...prev.cards, [chosenId]: card },
        cardOrder: [...prev.cardOrder, chosenId],
        // Auto-focus the first card so the empty-state UI swaps in
        // without an extra round-trip from the agent.
        activeId: prev.activeId ?? chosenId,
        flipped: prev.activeId ? prev.flipped : false,
      };
    });
    return chosenId;
  }, []);

  const updateCard: FlashcardsApi["updateCard"] = useCallback(({ id, front, back, tags }) => {
    setState((prev) => {
      const existing = prev.cards[id];
      if (!existing) return prev;
      return {
        ...prev,
        cards: {
          ...prev.cards,
          [id]: {
            ...existing,
            ...(front !== undefined ? { front } : {}),
            ...(back !== undefined ? { back } : {}),
            ...(tags !== undefined ? { tags } : {}),
          },
        },
      };
    });
  }, []);

  const removeCard: FlashcardsApi["removeCard"] = useCallback(({ id }) => {
    setState((prev) => {
      if (!prev.cards[id]) return prev;
      const cards = { ...prev.cards };
      delete cards[id];
      const cardOrder = prev.cardOrder.filter((c) => c !== id);
      const activeId = prev.activeId === id ? (cardOrder[0] ?? null) : prev.activeId;
      return {
        ...prev,
        cards,
        cardOrder,
        activeId,
        flipped: prev.activeId === id ? false : prev.flipped,
      };
    });
  }, []);

  const focusCard: FlashcardsApi["focusCard"] = useCallback(({ id }) => {
    setState((prev) => {
      if (!prev.cards[id]) return prev;
      return { ...prev, activeId: id, flipped: false };
    });
  }, []);

  const setFlipped: FlashcardsApi["setFlipped"] = useCallback((flipped) => {
    setState((prev) => (prev.activeId ? { ...prev, flipped } : prev));
  }, []);

  const next: FlashcardsApi["next"] = useCallback(() => {
    setState((prev) => {
      if (!prev.activeId || prev.cardOrder.length === 0) return prev;
      const idx = prev.cardOrder.indexOf(prev.activeId);
      const nextIdx = (idx + 1) % prev.cardOrder.length;
      return { ...prev, activeId: prev.cardOrder[nextIdx], flipped: false };
    });
  }, []);

  const prev: FlashcardsApi["prev"] = useCallback(() => {
    setState((prevState) => {
      if (!prevState.activeId || prevState.cardOrder.length === 0) return prevState;
      const idx = prevState.cardOrder.indexOf(prevState.activeId);
      const prevIdx = (idx - 1 + prevState.cardOrder.length) % prevState.cardOrder.length;
      return { ...prevState, activeId: prevState.cardOrder[prevIdx], flipped: false };
    });
  }, []);

  const gradeActive: FlashcardsApi["gradeActive"] = useCallback((grade) => {
    setState((prev) => {
      if (!prev.activeId) return prev;
      const card = prev.cards[prev.activeId];
      if (!card) return prev;
      const updated: Flashcard = {
        ...card,
        knewCount: grade === "knew" ? card.knewCount + 1 : card.knewCount,
        againCount: grade === "again" ? card.againCount + 1 : card.againCount,
        lastGrade: grade,
      };
      // Auto-advance to the next card after grading. Feels right on binary review
      // and avoids the student having to press two buttons each time.
      const idx = prev.cardOrder.indexOf(prev.activeId);
      const nextIdx = (idx + 1) % prev.cardOrder.length;
      const nextActive = prev.cardOrder.length > 1 ? prev.cardOrder[nextIdx] : prev.activeId;
      return {
        ...prev,
        cards: { ...prev.cards, [card.id]: updated },
        activeId: nextActive,
        flipped: false,
      };
    });
  }, []);

  const clear: FlashcardsApi["clear"] = useCallback(() => {
    setState((prev) => ({
      ...prev,
      cards: {},
      cardOrder: [],
      activeId: null,
      flipped: false,
    }));
  }, []);

  const reset: FlashcardsApi["reset"] = useCallback(() => {
    setState(EMPTY_STATE);
  }, []);

  // Validate type at the boundary so the agent gets a useful error when it
  // hallucinates an unknown card type.
  const validatedAddCard: FlashcardsApi["addCard"] = useCallback(
    (args) => {
      if (!VALID_TYPES.has(args.type)) {
        throw new Error(`invalid card type: ${args.type}`);
      }
      return addCard(args);
    },
    [addCard],
  );

  const api = useMemo(
    () => ({
      state,
      init,
      addCard: validatedAddCard,
      updateCard,
      removeCard,
      focusCard,
      setFlipped,
      next,
      prev,
      gradeActive,
      clear,
      reset,
    }),
    [
      state,
      init,
      validatedAddCard,
      updateCard,
      removeCard,
      focusCard,
      setFlipped,
      next,
      prev,
      gradeActive,
      clear,
      reset,
    ],
  );

  return api;
}
