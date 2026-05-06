"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUnifiedChat } from "@/context/UnifiedChatContext";
import { apiUrl } from "@/lib/api";
import { DrawioCanvas } from "./components/DrawioCanvas";
import { WhiteboardAIPanel } from "./components/WhiteboardAIPanel";
import { WhiteboardToolbar } from "./components/WhiteboardToolbar";
import { useDrawioCanvas } from "./hooks/useDrawioCanvas";
import { useWhiteboardSession } from "./hooks/useWhiteboardSession";
import type { NotebookSavePayload } from "@/components/notebook/SaveToNotebookModal";
import { Shapes, Plus, Save, Download, Sparkles, Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";

const SaveToNotebookModal = dynamic(
  () => import("@/components/notebook/SaveToNotebookModal"),
  { ssr: false },
);

interface WhiteboardMessage {
  role: "user" | "assistant";
  content: string;
}

function buildWhiteboardConversation(messages: WhiteboardMessage[]): string {
  const filtered = messages.filter(
    (msg) =>
      msg.content.trim() &&
      !(msg.role === "assistant" && msg.content.toLowerCase().includes("welcome")),
  );
  return filtered
    .slice(-20)
    .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content.trim()}`)
    .join("\n");
}

export default function WhiteboardPage() {
  const { t } = useTranslation();
  const { selectedSessionId } = useUnifiedChat();
  const pendingXmlRef = useRef<string | null>(null);
  const [notebookPayload, setNotebookPayload] = useState<NotebookSavePayload | null>(null);
  const [panelMessages, setPanelMessages] = useState<WhiteboardMessage[]>([]);
  const [deconstructing, setDeconstructing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { initialXml, saveXml, saveStatus } = useWhiteboardSession(selectedSessionId);
  const initialXmlRef = useRef<string | null>(null);
  initialXmlRef.current = initialXml;

  const handleChange = useCallback(
    (xml: string) => {
      pendingXmlRef.current = xml;
      saveXml(xml);
    },
    [saveXml],
  );

  const handleExport = useCallback((data: string, format: string) => {
    if (format === "xml") {
      pendingXmlRef.current = data;
      return;
    }
    if (format === "svg") {
      if (!data) {
        console.warn("SVG export returned empty data");
        return;
      }
      setNotebookPayload((prev) =>
        prev ? { ...prev, output: data } : null,
      );
    }
  }, []);

  const canvasReadyRef = useRef(false);

  const { iframeRef, loadXml, getXml, exportSvg } = useDrawioCanvas({
    onInit: () => {
      canvasReadyRef.current = true;
      loadXml(initialXmlRef.current ?? "");
    },
    onChange: handleChange,
    onExport: handleExport,
  });

  useEffect(() => {
    if (initialXml) {
      pendingXmlRef.current = initialXml;
      if (canvasReadyRef.current) {
        loadXml(initialXml);
      }
    }
  }, [initialXml, loadXml]);

  const handleXmlGenerated = useCallback(
    (xml: string) => {
      pendingXmlRef.current = xml;
      loadXml(xml);
      saveXml(xml);
    },
    [loadXml, saveXml],
  );

  const handleSaveToNotebook = useCallback(() => {
    const conversation = buildWhiteboardConversation(panelMessages);
    const latestUserMessage = [...panelMessages].reverse().find((msg) => msg.role === "user")?.content ?? "";
    setNotebookPayload({
      recordType: "whiteboard",
      title: "Whiteboard Diagram",
      userQuery: latestUserMessage,
      output: "",
      metadata: conversation
        ? {
            summary_source: conversation,
          }
        : {},
    });
    exportSvg();
  }, [exportSvg, panelMessages]);

  const handleExportDownload = useCallback(() => {
    getXml();
  }, [getXml]);

  const handleSmartDeconstruct = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDeconstructing(true);
    try {
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
          session_id: selectedSessionId
        })
      });

      if (res.ok) {
        const data = await res.json();
        handleXmlGenerated(data.xml);
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed to analyze diagram." }));
        alert(err?.detail ?? "Failed to analyze diagram.");
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while reading the image.");
    } finally {
      setDeconstructing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--background)] animate-fade-in">
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleFileChange}
      />
      
      {/* Header Section */}
      <div className="relative z-20 flex items-center justify-between px-8 py-4 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md shrink-0">
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-2 rounded-full bg-indigo-500/10 px-3 py-1 text-indigo-600 dark:text-indigo-400">
            <Shapes size={14} strokeWidth={2.5} />
            <span className="text-[11px] font-bold uppercase tracking-wider">{t("Workshop")}</span>
          </div>
          <h1 className="font-serif text-xl font-medium tracking-tight text-[var(--foreground)]">
            {t("Intelligent Whiteboard")}
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={handleSmartDeconstruct}
            disabled={deconstructing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
          >
            {deconstructing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            {t("Deconstruct Image")}
          </button>
          
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-2" />
          
          <button 
            onClick={handleExportDownload}
            className="p-2 rounded-xl text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-all"
            title={t("Export XML")}
          >
            <Download size={18} />
          </button>
          
          <button 
            onClick={handleSaveToNotebook}
            className="p-2 rounded-xl text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-all"
            title={t("Save to Notebook")}
          >
            <Save size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Draw.io Canvas Area */}
        <div className="flex-1 relative flex flex-col min-w-0 bg-slate-50 dark:bg-slate-900/50">
          <DrawioCanvas iframeRef={iframeRef} saveStatus={saveStatus} />
        </div>

        {/* AI Assistant Panel */}
        <div className="w-[400px] border-l border-[var(--border)] flex flex-col bg-[var(--card)]">
          <WhiteboardAIPanel
            sessionId={selectedSessionId}
            getCurrentXml={getXml}
            onXmlGenerated={handleXmlGenerated}
            pendingXmlRef={pendingXmlRef}
            onMessagesChange={setPanelMessages}
          />
        </div>
      </div>

      <SaveToNotebookModal
        open={notebookPayload !== null && notebookPayload.output !== ""}
        payload={notebookPayload}
        onClose={() => setNotebookPayload(null)}
      />

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.05);
          border-radius: 10px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.05);
        }
      `}</style>
    </div>
  );
}

function Loader2(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></svg>
  );
}
