"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useWhiteboardSession(sessionId: string | null) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [initialXml, setInitialXml] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    fetch(apiUrl(`/api/v1/whiteboard/session/${sessionId}`))
      .then((r) => r.json())
      .then((data: { xml: string }) => setInitialXml(data.xml || ""))
      .catch(() => setInitialXml(""));
  }, [sessionId]);

  const saveXml = useCallback(
    (xml: string) => {
      if (!sessionId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setSaveStatus("saving");
        try {
          const res = await fetch(apiUrl(`/api/v1/whiteboard/session/${sessionId}`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ xml }),
          });
          setSaveStatus(res.ok ? "saved" : "error");
          if (res.ok) setTimeout(() => setSaveStatus("idle"), 3000);
        } catch {
          setSaveStatus("error");
        }
      }, 2000);
    },
    [sessionId],
  );

  return { initialXml, saveXml, saveStatus };
}
