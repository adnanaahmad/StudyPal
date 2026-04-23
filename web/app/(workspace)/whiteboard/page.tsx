"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUnifiedChat } from "@/context/UnifiedChatContext";
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

export default function WhiteboardPage() {
  const { selectedSessionId } = useUnifiedChat();
  const pendingXmlRef = useRef<string | null>(null);
  const [notebookPayload, setNotebookPayload] = useState<NotebookSavePayload | null>(null);

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
    setNotebookPayload({
      recordType: "whiteboard",
      title: "Whiteboard Diagram",
      userQuery: "",
      output: "",
    });
    exportSvg();
  }, [exportSvg]);

  const handleExportDownload = useCallback(() => {
    getXml();
  }, [getXml]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--background)]">
      <WhiteboardToolbar
        onSaveToNotebook={handleSaveToNotebook}
        onExport={handleExportDownload}
      />
      <div className="flex flex-1 overflow-hidden">
        <DrawioCanvas iframeRef={iframeRef} saveStatus={saveStatus} />
        <WhiteboardAIPanel
          sessionId={selectedSessionId}
          getCurrentXml={getXml}
          onXmlGenerated={handleXmlGenerated}
          pendingXmlRef={pendingXmlRef}
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
