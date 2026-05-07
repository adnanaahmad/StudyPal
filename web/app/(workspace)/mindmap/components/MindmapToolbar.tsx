"use client";

import { Download, FileText, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

interface MindmapToolbarProps {
  markdown: string;
  onNew: () => void;
  saveStatus: "idle" | "saving" | "saved" | "error";
}

export function MindmapToolbar({ markdown, onNew, saveStatus }: MindmapToolbarProps) {
  const { t } = useTranslation();

  const handleExport = () => {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mindmap.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--secondary)] px-4">
      <div className="flex items-center gap-2">
        <FileText size={14} className="text-[var(--muted-foreground)]" />
        <span className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
          {t("Mindmap")}
        </span>
        {saveStatus === "saving" && (
          <span className="text-[11px] text-[var(--muted-foreground)]">{t("Saving…")}</span>
        )}
        {saveStatus === "saved" && (
          <span className="text-[11px] text-emerald-500">{t("Saved")}</span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)]/50 px-2.5 py-1 text-[12px] font-medium text-[var(--muted-foreground)] transition-colors hover:border-[var(--border)] hover:text-[var(--foreground)]"
        >
          <RotateCcw size={12} />
          {t("New")}
        </button>
        <button
          onClick={handleExport}
          disabled={!markdown}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)]/50 px-2.5 py-1 text-[12px] font-medium text-[var(--muted-foreground)] transition-colors hover:border-[var(--border)] hover:text-[var(--foreground)] disabled:opacity-40"
        >
          <Download size={12} />
          {t("Export")}
        </button>
      </div>
    </div>
  );
}
