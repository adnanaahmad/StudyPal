"use client";

import { useCallback, useEffect, useRef } from "react";

export type DrawioEvent =
  | { event: "init" }
  | { event: "load"; xml: string }
  | { event: "change"; xml: string }
  | { event: "export"; data: string; format: string };

interface UseDrawioCanvasOptions {
  onInit?: () => void;
  onChange?: (xml: string) => void;
  onExport?: (data: string, format: string) => void;
}

export function useDrawioCanvas({ onInit, onChange, onExport }: UseDrawioCanvasOptions = {}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const postMessage = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(msg), "*");
  }, []);

  const loadXml = useCallback(
    (xml: string) => {
      postMessage({ action: "load", xml });
    },
    [postMessage],
  );

  const getXml = useCallback(() => {
    postMessage({ action: "export", format: "xml" });
  }, [postMessage]);

  const exportSvg = useCallback(() => {
    postMessage({ action: "export", format: "svg" });
  }, [postMessage]);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      let data: DrawioEvent;
      try {
        data = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
      } catch {
        return;
      }
      if (data.event === "init") onInit?.();
      if (data.event === "change") onChange?.(data.xml);
      if (data.event === "export") onExport?.(data.data, data.format);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onInit, onChange, onExport]);

  return { iframeRef, loadXml, getXml, exportSvg };
}
