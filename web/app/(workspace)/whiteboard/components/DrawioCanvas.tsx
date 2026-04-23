"use client";

import { useEffect, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";

interface DrawioCanvasProps {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  saveStatus: "idle" | "saving" | "saved" | "error";
}

function getDrawioUrl(dark: boolean): string {
  const params = new URLSearchParams({
    embed: "1",
    spin: "1",
    modified: "unsavedChanges",
    proto: "json",
    dark: dark ? "1" : "0",
  });
  return `https://embed.diagrams.net/?${params.toString()}`;
}

export function DrawioCanvas({ iframeRef, saveStatus }: DrawioCanvasProps) {
  const { t } = useTranslation();
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false,
  );
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    obs.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {loadError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--muted-foreground)]">
          <p className="text-sm">{t("whiteboard.canvas.loadError")}</p>
          <button
            onClick={() => setLoadError(false)}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm text-[var(--primary-foreground)]"
          >
            {t("whiteboard.canvas.retry")}
          </button>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          src={getDrawioUrl(isDark)}
          className="flex-1 border-0"
          onError={() => setLoadError(true)}
          allow="clipboard-read; clipboard-write"
          title={t("whiteboard.canvas.title")}
        />
      )}
      <div className="flex h-6 items-center border-t border-[var(--border)] px-3 text-[11px] text-[var(--muted-foreground)]">
        {saveStatus === "saving" && t("whiteboard.canvas.autoSaving")}
        {saveStatus === "saved" && t("whiteboard.canvas.saved")}
        {saveStatus === "error" && t("whiteboard.canvas.saveFailed")}
      </div>
    </div>
  );
}
