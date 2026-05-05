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
      // Always send load to exit draw.io's proto=json loading state
      loadXml(initialXmlRef.current ?? "");
    },
    onChange: handleChange,
    onExport: handleExport,
  });

  // If the API responds after init fires, load the saved XML now
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
      // Wrap FileReader in a Promise so errors propagate to the outer try/catch
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
      // Reset so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };


  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--background)]">
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleFileChange}
      />
      <WhiteboardToolbar
        onSaveToNotebook={handleSaveToNotebook}
        onExport={handleExportDownload}
        onSmartDeconstruct={handleSmartDeconstruct}
        isDeconstructing={deconstructing}
      />
      <div className="flex flex-1 overflow-hidden">
        <DrawioCanvas iframeRef={iframeRef} saveStatus={saveStatus} />
        <WhiteboardAIPanel
          sessionId={selectedSessionId}
          getCurrentXml={getXml}
          onXmlGenerated={handleXmlGenerated}
          pendingXmlRef={pendingXmlRef}
          onMessagesChange={setPanelMessages}
        />
      </div>
      <SaveToNotebookModal
        open={notebookPayload !== null && notebookPayload.output !== ""}
        payload={notebookPayload}
        onClose={() => setNotebookPayload(null)}
      />
    </div>
  );
}
