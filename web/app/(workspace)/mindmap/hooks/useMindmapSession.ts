import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";

interface UseMindmapSessionReturn {
  initialMarkdown: string | null;
  saveMarkdown: (md: string) => void;
  saveStatus: "idle" | "saving" | "saved" | "error";
}

export function useMindmapSession(sessionId: string | null): UseMindmapSessionReturn {
  const [initialMarkdown, setInitialMarkdown] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved markdown when session is available
  useEffect(() => {
    if (!sessionId) return;
    fetch(apiUrl(`/api/v1/mindmap/session/${sessionId}`))
      .then((r) => r.json())
      .then((data: { markdown: string }) => {
        if (data.markdown) setInitialMarkdown(data.markdown);
      })
      .catch(() => { /* not critical */ });
  }, [sessionId]);

  const saveMarkdown = useCallback(
    (md: string) => {
      if (!sessionId) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        setSaveStatus("saving");
        try {
          await fetch(apiUrl(`/api/v1/mindmap/session/${sessionId}`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ markdown: md }),
          });
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 1500);
        } catch {
          setSaveStatus("error");
        }
      }, 1000);
    },
    [sessionId],
  );

  return { initialMarkdown, saveMarkdown, saveStatus };
}
