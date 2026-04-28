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
          className="flex items-center gap-1.5 rounded-lg bg-[var(--background)] px-3 py-1.5 text-[12px] border border-[var(--border)] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
        >
          {t("whiteboard.saveToNotebook")}
        </button>
      </div>
    </div>
  );
}
