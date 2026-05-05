"use client";

import { Download, Save, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

interface WhiteboardToolbarProps {
  onSaveToNotebook: () => void;
  onExport: () => void;
  onSmartDeconstruct?: () => void;
  isDeconstructing?: boolean;
}

export function WhiteboardToolbar({
  onSaveToNotebook,
  onExport,
  onSmartDeconstruct,
  isDeconstructing,
}: WhiteboardToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--secondary)] px-4">
      <span className="text-[13.5px] font-semibold text-[var(--foreground)]">
        {t("whiteboard.title")}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={onSmartDeconstruct}
          disabled={isDeconstructing}
          className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 px-3 py-1.5 text-[12px] border border-amber-500/30 text-amber-700 transition-colors hover:from-amber-500/30 hover:to-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles size={14} className={`text-amber-600 ${isDeconstructing ? 'animate-spin' : ''}`} />
          {isDeconstructing ? t("whiteboard.aiPanel.generating") : t("whiteboard.smartDeconstruct")}
        </button>
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
