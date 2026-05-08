"use client";

import { Download, Layers, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FlashcardsState } from "../hooks/useFlashcardsState";

interface FlashcardsToolbarProps {
  state: FlashcardsState;
  onReset: () => void;
}

function buildExportText(state: FlashcardsState): string {
  if (!state.cardOrder.length) return "";
  const lines: string[] = [];
  if (state.topic) lines.push(`# ${state.topic}`);
  if (state.description) lines.push("", state.description, "");
  for (const id of state.cardOrder) {
    const c = state.cards[id];
    if (!c) continue;
    lines.push("", `## ${c.front}`, "", c.back);
  }
  return lines.join("\n");
}

export function FlashcardsToolbar({ state, onReset }: FlashcardsToolbarProps) {
  const { t } = useTranslation();
  const count = state.cardOrder.length;

  const handleExport = () => {
    const text = buildExportText(state);
    if (!text) return;
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.topic ? state.topic.toLowerCase().replace(/\s+/g, "-") : "flashcards"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--secondary)] px-4">
      <div className="flex min-w-0 items-center gap-2">
        <Layers size={14} className="text-[var(--muted-foreground)]" />
        <span className="truncate text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
          {state.topic ? state.topic : t("Flashcards")}
        </span>
        {count > 0 && (
          <span className="text-[11px] text-[var(--muted-foreground)]">
            · {count} {count === 1 ? t("card") : t("cards")}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)]/50 px-2.5 py-1 text-[12px] font-medium text-[var(--muted-foreground)] transition-colors hover:border-[var(--border)] hover:text-[var(--foreground)]"
        >
          <RotateCcw size={12} />
          {t("New")}
        </button>
        <button
          onClick={handleExport}
          disabled={count === 0}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)]/50 px-2.5 py-1 text-[12px] font-medium text-[var(--muted-foreground)] transition-colors hover:border-[var(--border)] hover:text-[var(--foreground)] disabled:opacity-40"
        >
          <Download size={12} />
          {t("Export")}
        </button>
      </div>
    </div>
  );
}
