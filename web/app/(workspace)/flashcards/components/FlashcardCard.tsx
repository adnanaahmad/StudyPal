"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Check, RotateCw, X } from "lucide-react";
import MarkdownRenderer from "@/components/common/MarkdownRenderer";
import type { CardGrade, Flashcard } from "../hooks/useFlashcardsState";

interface FlashcardCardProps {
  card: Flashcard;
  index: number;
  total: number;
  flipped: boolean;
  onFlip: (next: boolean) => void;
  onGrade: (grade: CardGrade) => void;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Render the cloze front by replacing each {{...}} segment with a styled blank.
 * The unblanked sentence lives on the back — students flip to verify.
 */
function renderClozeFront(text: string): string {
  // Up to 24 underscores keeps blanks visible across font sizes; KaTeX-safe (outside $).
  return text.replace(/\{\{[^}]+\}\}/g, "______");
}

export function FlashcardCard({
  card,
  index,
  total,
  flipped,
  onFlip,
  onGrade,
  onPrev,
  onNext,
}: FlashcardCardProps) {
  const { t } = useTranslation();

  // Keyboard shortcuts: Space = flip, ←/→ = prev/next, 1 = again, 2 = knew it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      // Ignore typing inside the chat sidebar.
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        onFlip(!flipped);
      } else if (e.code === "ArrowRight") {
        onNext();
      } else if (e.code === "ArrowLeft") {
        onPrev();
      } else if (flipped && (e.key === "1" || e.key.toLowerCase() === "a")) {
        onGrade("again");
      } else if (flipped && (e.key === "2" || e.key.toLowerCase() === "k")) {
        onGrade("knew");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, onFlip, onGrade, onNext, onPrev]);

  const front = card.type === "cloze" ? renderClozeFront(card.front) : card.front;
  const back = card.back;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 px-4 py-8">
      {/* Progress + type badge */}
      <div className="flex w-full max-w-2xl items-center justify-between text-[11px] font-medium text-[var(--muted-foreground)]">
        <span>
          {index + 1} / {total}
        </span>
        <span className="rounded-full border border-[var(--border)] bg-[var(--secondary)] px-2 py-0.5 uppercase tracking-wider">
          {card.type === "qa" ? t("Q&A") : t("Cloze")}
        </span>
      </div>

      {/* Card stage */}
      <button
        type="button"
        onClick={() => onFlip(!flipped)}
        className="group relative h-[320px] w-full max-w-2xl [perspective:1200px]"
        aria-label={flipped ? t("Show front") : t("Show back")}
      >
        <div
          className={`relative h-full w-full rounded-3xl shadow-lg transition-transform duration-500 [transform-style:preserve-3d] ${
            flipped ? "[transform:rotateY(180deg)]" : ""
          }`}
        >
          {/* Front */}
          <div className="absolute inset-0 flex flex-col items-center justify-center overflow-auto rounded-3xl border border-[var(--border)] bg-[var(--card)] p-8 [backface-visibility:hidden]">
            <span className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
              {t("Front")}
            </span>
            <div className="flex flex-1 w-full items-center justify-center text-center">
              <div className="prose prose-sm dark:prose-invert max-w-none text-[var(--foreground)]">
                <MarkdownRenderer content={front} variant="prose" />
              </div>
            </div>
            <span className="mt-4 text-[11px] text-[var(--muted-foreground)]">
              {t("Tap or press Space to flip")}
            </span>
          </div>

          {/* Back */}
          <div className="absolute inset-0 flex flex-col items-center justify-center overflow-auto rounded-3xl border border-[var(--border)] bg-[var(--secondary)] p-8 [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <span className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
              {t("Back")}
            </span>
            <div className="flex flex-1 w-full items-center justify-center text-center">
              <div className="prose prose-sm dark:prose-invert max-w-none text-[var(--foreground)]">
                <MarkdownRenderer content={back} variant="prose" />
              </div>
            </div>
            <span className="mt-4 text-[11px] text-[var(--muted-foreground)]">
              {t("How well did you know it?")}
            </span>
          </div>
        </div>
      </button>

      {/* Controls */}
      <div className="flex w-full max-w-2xl items-center justify-between gap-3">
        <button
          onClick={onPrev}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12px] font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
        >
          ← {t("Prev")}
        </button>

        {flipped ? (
          <div className="flex flex-1 items-center justify-center gap-3">
            <button
              onClick={() => onGrade("again")}
              className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-[13px] font-semibold text-rose-600 transition-colors hover:bg-rose-500/20 dark:text-rose-400"
            >
              <X size={14} />
              {t("Again")}
            </button>
            <button
              onClick={() => onGrade("knew")}
              className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-[13px] font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
            >
              <Check size={14} />
              {t("Knew it")}
            </button>
          </div>
        ) : (
          <button
            onClick={() => onFlip(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--primary)]/40 bg-[var(--primary)]/10 px-4 py-2 text-[13px] font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary)]/20"
          >
            <RotateCw size={14} />
            {t("Flip")}
          </button>
        )}

        <button
          onClick={onNext}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12px] font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
        >
          {t("Next")} →
        </button>
      </div>
    </div>
  );
}
