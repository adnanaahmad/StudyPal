"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Paperclip, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MindmapToolbar } from "./components/MindmapToolbar";
import { useMindmapSession } from "./hooks/useMindmapSession";
import { apiUrl } from "@/lib/api";

// Markmap uses browser-only D3 — must be client-side only
const MindmapCanvas = dynamic(
  () => import("./components/MindmapCanvas").then((m) => m.MindmapCanvas),
  { ssr: false },
);

export default function MindmapPage() {
  const { t } = useTranslation();

  const [markdown, setMarkdown] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<{ name: string; content: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { initialMarkdown, saveMarkdown, saveStatus } = useMindmapSession(sessionId);

  // Restore saved markdown when session loads
  useEffect(() => {
    if (initialMarkdown) setMarkdown(initialMarkdown);
  }, [initialMarkdown]);

  // Sync session ID removed to decouple from chat

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "24px";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const handleFileAttach = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const content = await file.text();
    setAttachment({ name: file.name, content });
  };

  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;

    setLoading(true);
    setError(null);
    setMarkdown(""); // Clear canvas while thinking

    try {
      const res = await fetch(apiUrl("/api/v1/mindmap/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          file_content: attachment?.content ?? null,
          current_markdown: markdown,
          session_id: sessionId,
        }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data = (await res.json()) as {
        markdown: string;
        message: string;
        session_id: string;
      };

      setMarkdown(data.markdown);
      setSessionId(data.session_id);
      saveMarkdown(data.markdown);
      setAttachment(null);
      setInput(""); // Clear only on success
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [input, loading, attachment, markdown, sessionId, saveMarkdown]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleNew = () => {
    setMarkdown("");
    setInput("");
    setAttachment(null);
    setError(null);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--background)]">
      {/* Toolbar */}
      <MindmapToolbar markdown={markdown} onNew={handleNew} saveStatus={saveStatus} />

      {/* Canvas — fills remaining height */}
      <div className="relative flex flex-1 overflow-hidden">
        <MindmapCanvas markdown={markdown} />

        {/* ── Central Loader ── */}
        {loading && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-white dark:bg-slate-950">
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-2.5">
                <div className="h-2 w-2 rounded-full bg-[var(--primary)] animate-bounce [animation-delay:-0.3s]" />
                <div className="h-2 w-2 rounded-full bg-[var(--primary)] animate-bounce [animation-delay:-0.15s]" />
                <div className="h-2 w-2 rounded-full bg-[var(--primary)] animate-bounce" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--primary)] opacity-40">
                {t("Thinking")}
              </p>
            </div>
          </div>
        )}

        {/* ── Floating composer bar ── */}
        <div className="absolute bottom-6 left-1/2 w-full max-w-[680px] -translate-x-1/2 px-4 z-50">
          {/* Error banner */}
          {error && (
            <div className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
              {error}
            </div>
          )}

          {/* Attachment chip */}
          {attachment && (
            <div className="mb-2 flex w-fit items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--secondary)] px-3 py-1 text-[12px] text-[var(--foreground)]">
              <Paperclip size={11} className="text-[var(--muted-foreground)]" />
              <span className="max-w-[200px] truncate">{attachment.name}</span>
              <button onClick={() => setAttachment(null)} className="ml-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                <X size={11} />
              </button>
            </div>
          )}

          {/* Input bar */}
          <div className="flex items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--secondary)] px-3 py-2.5 shadow-lg backdrop-blur-sm">
            {/* File attach */}
            <button
              onClick={handleFileAttach}
              title={t("Attach TXT file")}
              className="shrink-0 rounded-lg p-1 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
            >
              <Paperclip size={15} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder={loading ? t("AI is thinking...") : t("Describe a topic or ask to modify the map…")}
              rows={1}
              className={`flex-1 resize-none bg-transparent text-[13.5px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none transition-opacity ${loading ? "opacity-50" : ""}`}
              style={{ minHeight: "24px", maxHeight: "120px" }}
            />

            {/* Send button */}
            <button
              onClick={() => void handleSend()}
              disabled={loading || !input.trim()}
              className="shrink-0 rounded-lg bg-[var(--primary)] p-1.5 text-[var(--primary-foreground)] transition-opacity disabled:opacity-40"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ArrowUp size={14} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
