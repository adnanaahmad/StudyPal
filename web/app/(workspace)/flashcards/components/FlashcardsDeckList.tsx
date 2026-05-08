"use client";

import { useTranslation } from "react-i18next";
import { Check, Layers, X } from "lucide-react";
import type { Flashcard, FlashcardsState } from "../hooks/useFlashcardsState";

interface FlashcardsDeckListProps {
  state: FlashcardsState;
  onSelect: (id: string) => void;
}

/**
 * Show the front (or cloze cue) trimmed for the strip. The agent already
 * truncates to ~140 chars in the readable; here we just keep it on one line.
 */
function previewFront(card: Flashcard): string {
  const raw = card.type === "cloze" ? card.front.replace(/\{\{[^}]+\}\}/g, "____") : card.front;
  return raw.replace(/\s+/g, " ").trim();
}

export function FlashcardsDeckList({ state, onSelect }: FlashcardsDeckListProps) {
  const { t } = useTranslation();

  if (!state.cardOrder.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-[var(--muted-foreground)]">
        <Layers size={20} className="opacity-50" />
        <p className="text-[11px]">{t("No cards yet")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
        {t("Deck")}
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto px-2 pb-3">
        {state.cardOrder.map((id, idx) => {
          const card = state.cards[id];
          if (!card) return null;
          const isActive = state.activeId === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={`group flex w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-left text-[12px] transition-colors ${
                isActive
                  ? "border-[var(--primary)]/50 bg-[var(--primary)]/10 text-[var(--foreground)]"
                  : "border-transparent bg-[var(--card)] text-[var(--muted-foreground)] hover:border-[var(--border)] hover:text-[var(--foreground)]"
              }`}
            >
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--secondary)] text-[10px] font-semibold">
                {idx + 1}
              </span>
              <span className="line-clamp-2 flex-1">{previewFront(card)}</span>
              <span className="ml-1 mt-0.5 flex shrink-0 items-center gap-0.5">
                {card.knewCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-emerald-500">
                    <Check size={10} />
                    {card.knewCount}
                  </span>
                )}
                {card.againCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-rose-500">
                    <X size={10} />
                    {card.againCount}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
