"use client";

import { ArrowUp, Loader2, Paperclip } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiUrl } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface WhiteboardAIPanelProps {
  sessionId: string | null;
  getCurrentXml: () => void;
  onXmlGenerated: (xml: string) => void;
  pendingXmlRef: React.MutableRefObject<string | null>;
  onMessagesChange?: (messages: Message[]) => void;
}

export function WhiteboardAIPanel({
  sessionId,
  getCurrentXml,
  onXmlGenerated,
  pendingXmlRef,
  onMessagesChange,
}: WhiteboardAIPanelProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: t("whiteboard.aiPanel.welcome") },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(sessionId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync with prop if it changes externally
  useEffect(() => {
    if (sessionId) {
      setCurrentSessionId(sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    onMessagesChange?.(messages);
  }, [messages, onMessagesChange]);

  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: prompt }]);
    setLoading(true);

    // The current XML is now always kept up to date in the ref by the parent page
    const currentXml = pendingXmlRef.current ?? "";

    try {
      const res = await fetch(apiUrl("/api/v1/whiteboard/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          current_xml: currentXml,
          session_id: currentSessionId,
        }),
      });
      const data = (await res.json()) as { xml: string; message: string; session_id: string };
      setCurrentSessionId(data.session_id);
      onXmlGenerated(data.xml);
      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, currentSessionId, getCurrentXml, onXmlGenerated, pendingXmlRef]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: "Uploaded a diagram for deconstruction." }]);

    try {
      // Wrap FileReader in a Promise so errors in the async callback are caught here
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target?.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });

      const res = await fetch(apiUrl("/api/v1/whiteboard/deconstruct"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_base64: base64,
          session_id: currentSessionId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        onXmlGenerated(data.xml);
        setMessages((prev) => [...prev, { role: "assistant", content: "Diagram deconstructed successfully!" }]);
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed to analyze diagram." }));
        const msg = err?.detail ?? "Failed to analyze diagram.";
        setMessages((prev) => [...prev, { role: "assistant", content: msg }]);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [...prev, { role: "assistant", content: "An error occurred during upload." }]);
    } finally {
      setLoading(false);
      // Reset input so the same file can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };


  return (
    <div className="flex w-[320px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--background)]">
      <div className="flex h-10 shrink-0 items-center border-b border-[var(--border)] bg-[var(--secondary)] px-4">
        <span className="text-[13px] font-semibold text-[var(--foreground)]">
          {t("whiteboard.aiPanel.title")}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`rounded-lg px-3 py-2 text-[12.5px] ${msg.role === "user"
                ? "self-end bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "bg-[var(--muted)] text-[var(--foreground)]"
              }`}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-[12px] text-[var(--muted-foreground)]">
            <Loader2 size={13} className="animate-spin" />
            {t("whiteboard.aiPanel.generating")}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] p-3">

        <div className="flex items-end gap-2">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg p-2 text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
            title="Upload diagram image"
          >
            <Paperclip size={18} />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={t("whiteboard.aiPanel.placeholder")}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[12.5px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
          />
          <button
            onClick={() => void handleSend()}
            disabled={loading || !input.trim()}
            className="rounded-lg bg-[var(--primary)] p-2 text-[var(--primary-foreground)] disabled:opacity-40"
          >
            <ArrowUp size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
