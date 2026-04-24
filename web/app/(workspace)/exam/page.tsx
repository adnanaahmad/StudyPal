"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, Loader2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ExamTakeSession } from "@/components/exam/ExamTakeSession";
import { apiUrl } from "@/lib/api";
import {
  buildExamFollowupConfig,
  buildExamSimulatorConfig,
  parseExamGenerateResult,
  parseExamGradingSummary,
  type ExamGenerationSource,
  type ExamGradingSummary,
  type ExamSessionPayload,
  type ExamSimulatorFormValues,
} from "@/lib/exam-simulator-types";
import {
  invalidateKnowledgeCaches,
  listKnowledgeBases,
  type KnowledgeBaseSummary,
} from "@/lib/knowledge-api";
import { UnifiedWSClient, type ChatMessage, type StreamEvent } from "@/lib/unified-ws";

const EXAM_TOOLS = ["rag", "reason"] as const;

function parseNonNegInt(raw: string, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

export default function ExamSimulatorPage() {
  const { t, i18n } = useTranslation();

  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState("45");
  const [mcq, setMcq] = useState("5");
  const [shortN, setShortN] = useState("2");
  const [longN, setLongN] = useState("1");
  const [generationSource, setGenerationSource] = useState<ExamGenerationSource>("topic_only");
  const [docIds, setDocIds] = useState("");
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseSummary[]>([]);
  const [uploadKb, setUploadKb] = useState("");
  const [kbsLoading, setKbsLoading] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOverUpload, setDragOverUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const examViewportRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<UnifiedWSClient | null>(null);
  const activeTurnIdRef = useRef<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);
  const [lastStreamError, setLastStreamError] = useState<string | null>(null);
  const [pendingExamTurn, setPendingExamTurn] = useState<
    "generate" | "save_answer" | "submit" | "grade" | "state" | null
  >(null);

  useEffect(() => {
    if (generationSource !== "topic_plus_docs") return;
    let cancelled = false;
    setKbsLoading(true);
    void listKnowledgeBases({ force: true })
      .then((list) => {
        if (cancelled) return;
        setKnowledgeBases(list);
        setUploadKb((prev) => {
          if (prev && list.some((k) => k.name === prev)) return prev;
          const def = list.find((k) => k.is_default)?.name;
          return def ?? list[0]?.name ?? "";
        });
      })
      .catch(() => {
        if (!cancelled) setKnowledgeBases([]);
      })
      .finally(() => {
        if (!cancelled) setKbsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [generationSource]);

  /** When "Topic + documents" is on and references are empty, fill from KB `raw/` filenames (server). */
  useEffect(() => {
    if (generationSource !== "topic_plus_docs" || !uploadKb.trim()) return;
    let cancelled = false;
    void fetch(apiUrl(`/api/v1/knowledge/${encodeURIComponent(uploadKb)}`))
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{ statistics?: { raw_document_filenames?: string[] } }>;
      })
      .then((info) => {
        if (cancelled || !info) return;
        const names = info.statistics?.raw_document_filenames;
        if (!Array.isArray(names) || names.length === 0) return;
        setDocIds((prev) => {
          if (prev.trim() !== "") return prev;
          return names.join(", ");
        });
      });
    return () => {
      cancelled = true;
    };
  }, [generationSource, uploadKb]);

  const formValues = useMemo((): ExamSimulatorFormValues | null => {
    const durationMinutes = parseNonNegInt(duration, 45);
    return {
      topic: topic.trim(),
      durationMinutes,
      mcq: parseNonNegInt(mcq, 0),
      short: parseNonNegInt(shortN, 0),
      long: parseNonNegInt(longN, 0),
      generationSource,
      uploadedDocIds: docIds,
    };
  }, [topic, duration, mcq, shortN, longN, generationSource, docIds]);

  const validationError = useMemo(() => {
    if (!formValues?.topic) return "topic";
    const d = formValues.durationMinutes;
    if (d < 5 || d > 240) return "duration";
    const total = formValues.mcq + formValues.short + formValues.long;
    if (total <= 0) return "mix";
    if (formValues.generationSource === "topic_plus_docs") {
      const ids = formValues.uploadedDocIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length === 0) return "docs";
    }
    return null;
  }, [formValues]);

  const validationMessage = useMemo(() => {
    if (!validationError) return null;
    if (validationError === "topic") return t("exam.validation.topic");
    if (validationError === "duration") return t("exam.validation.duration");
    if (validationError === "mix") return t("exam.validation.mix");
    if (validationError === "docs") return t("exam.validation.docs");
    return null;
  }, [validationError, t]);

  useEffect(() => {
    const onEvent = (event: StreamEvent) => {
      if (event.type === "session") {
        const turnId =
          ((event.metadata as { turn_id?: string } | undefined)?.turn_id || event.turn_id || "").trim();
        activeTurnIdRef.current = turnId || null;
        return;
      }
      if (event.type === "result") {
        setLastResult((event.metadata as Record<string, unknown>) || null);
        return;
      }
      if (event.type === "error") {
        setLastStreamError(event.content || t("exam.error"));
        const terminal = Boolean(
          (event.metadata as { turn_terminal?: boolean } | undefined)?.turn_terminal,
        );
        if (terminal) {
          setIsStreaming(false);
          setPendingExamTurn(null);
          activeTurnIdRef.current = null;
        }
        return;
      }
      if (event.type === "done") {
        setIsStreaming(false);
        setPendingExamTurn(null);
        activeTurnIdRef.current = null;
      }
    };

    const client = new UnifiedWSClient(onEvent, () => {
      setIsStreaming(false);
      setPendingExamTurn(null);
      activeTurnIdRef.current = null;
    });
    wsRef.current = client;
    client.connect();
    return () => {
      client.disconnect();
      wsRef.current = null;
    };
  }, [t]);

  const sendThroughExamWs = useCallback((msg: ChatMessage, attempt = 0) => {
    const client = wsRef.current;
    if (!client) return;
    if (!client.connected) {
      if (attempt >= 10) {
        setIsStreaming(false);
        setLastStreamError("Exam connection unavailable.");
        return;
      }
      window.setTimeout(() => sendThroughExamWs(msg, attempt + 1), 200);
      return;
    }
    client.send(msg);
  }, []);

  const [examSession, setExamSession] = useState<ExamSessionPayload | null>(null);
  const [examAnswers, setExamAnswers] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [grading, setGrading] = useState<ExamGradingSummary | null>(null);
  const [takeLocked, setTakeLocked] = useState(false);
  const saveTimersRef = useRef<Record<string, number>>({});
  const saveStatusResetTimerRef = useRef<number | null>(null);
  const saveStatusPendingTimerRef = useRef<number | null>(null);
  const prevBusyRef = useRef(false);

  useEffect(() => {
    if (!lastResult) return;
    const meta = lastResult as Record<string, unknown>;
    const turn = meta.exam_turn;
    const fresh = parseExamGenerateResult(meta);
    if (fresh) {
      setExamSession(fresh);
      setExamAnswers({});
      setGrading(null);
      setTakeLocked(false);
      setSaveStatus("idle");
      setSaveError(null);
      return;
    }
    if (turn === "save_answer" || turn === "submit" || turn === "grade" || turn === "state") {
      const rawAnswers = meta.answers;
      if (rawAnswers && typeof rawAnswers === "object" && !Array.isArray(rawAnswers)) {
        setExamAnswers((prev) => ({ ...prev, ...(rawAnswers as Record<string, string>) }));
      }
      if (meta.grading) {
        const g = parseExamGradingSummary(meta.grading);
        if (g) setGrading(g);
      }
      if (meta.exam_closed === true || meta.status === "graded") {
        setTakeLocked(true);
      } else if (meta.status === "submitted" && meta.grading) {
        setTakeLocked(true);
      }
    }
  }, [lastResult]);

  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = isStreaming;
    if (!wasBusy || isStreaming) return;
    const turn = (lastResult as Record<string, unknown> | null)?.exam_turn;
    if (turn === "save_answer") {
      if (saveStatusPendingTimerRef.current) {
        window.clearTimeout(saveStatusPendingTimerRef.current);
        saveStatusPendingTimerRef.current = null;
      }
      if (lastStreamError) {
        setSaveStatus("error");
        setSaveError(lastStreamError);
      } else {
        if (saveStatusResetTimerRef.current) {
          window.clearTimeout(saveStatusResetTimerRef.current);
          saveStatusResetTimerRef.current = null;
        }
        setSaveStatus("saved");
        saveStatusResetTimerRef.current = window.setTimeout(() => {
          setSaveStatus("idle");
          saveStatusResetTimerRef.current = null;
        }, 2000);
      }
    }
  }, [isStreaming, lastResult, lastStreamError]);

  useEffect(() => {
    return () => {
      if (saveStatusResetTimerRef.current) {
        window.clearTimeout(saveStatusResetTimerRef.current);
      }
      if (saveStatusPendingTimerRef.current) {
        window.clearTimeout(saveStatusPendingTimerRef.current);
      }
    };
  }, []);

  const sendExamConfig = useCallback(
    (config: Record<string, unknown>) => {
      const turnRaw = config.exam_turn;
      const turn =
        turnRaw === "save_answer" ||
        turnRaw === "submit" ||
        turnRaw === "grade" ||
        turnRaw === "state"
          ? turnRaw
          : "generate";
      setLastStreamError(null);
      setPendingExamTurn(turn);
      setIsStreaming(true);
      sendThroughExamWs({
        type: "start_turn",
        content: "",
        tools: [...EXAM_TOOLS],
        capability: "exam_simulator",
        knowledge_bases: [],
        language: i18n.language || "en",
        config,
      });
    },
    [sendThroughExamWs, i18n.language],
  );

  const flushSaveAnswer = useCallback(
    (questionId: string, value: string) => {
      if (!examSession || takeLocked) return;
      if (saveStatusResetTimerRef.current) {
        window.clearTimeout(saveStatusResetTimerRef.current);
        saveStatusResetTimerRef.current = null;
      }
      if (saveStatusPendingTimerRef.current) {
        window.clearTimeout(saveStatusPendingTimerRef.current);
      }
      // Delay "saving" indicator slightly to avoid flicker on fast round-trips.
      saveStatusPendingTimerRef.current = window.setTimeout(() => {
        setSaveStatus("saving");
        saveStatusPendingTimerRef.current = null;
      }, 180);
      sendExamConfig(
        buildExamFollowupConfig("save_answer", {
          attemptId: examSession.attempt_id,
          questionId,
          answer: value,
        }),
      );
    },
    [examSession, takeLocked, sendExamConfig],
  );

  const queueSaveAnswer = useCallback(
    (questionId: string, value: string) => {
      const prev = saveTimersRef.current[questionId];
      if (prev) window.clearTimeout(prev);
      saveTimersRef.current[questionId] = window.setTimeout(() => {
        delete saveTimersRef.current[questionId];
        flushSaveAnswer(questionId, value);
      }, 750);
    },
    [flushSaveAnswer],
  );

  const handleExamAnswerChange = useCallback(
    (questionId: string, value: string) => {
      setExamAnswers((prev) => ({ ...prev, [questionId]: value }));
      queueSaveAnswer(questionId, value);
    },
    [queueSaveAnswer],
  );

  const submitExam = useCallback(() => {
    if (!examSession) return;
    sendExamConfig(buildExamFollowupConfig("submit", { attemptId: examSession.attempt_id }));
  }, [examSession, sendExamConfig]);

  const mergeDocIdStrings = useCallback((prev: string, names: string[]) => {
    const next = new Set(
      prev
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    for (const n of names) {
      if (n.trim()) next.add(n.trim());
    }
    return [...next].join(", ");
  }, []);

  const handleExamFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter(Boolean);
      if (!list.length) return;
      if (!uploadKb) {
        setUploadError(t("exam.uploadNoKb"));
        return;
      }
      setUploadBusy(true);
      setUploadError(null);
      try {
        const form = new FormData();
        for (const f of list) {
          form.append("files", f);
        }
        const res = await fetch(apiUrl(`/api/v1/knowledge/${encodeURIComponent(uploadKb)}/upload`), {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { detail?: string };
          throw new Error(errBody.detail || res.statusText || "Upload failed");
        }
        const data = (await res.json()) as { files?: string[] };
        const names = Array.isArray(data.files) ? data.files : [];
        if (names.length) {
          setDocIds((prev) => mergeDocIdStrings(prev, names));
        }
        invalidateKnowledgeCaches();
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : String(e));
      } finally {
        setUploadBusy(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [mergeDocIdStrings, t, uploadKb],
  );

  const handleStart = useCallback(() => {
    setAttemptedSubmit(true);
    if (!formValues || validationError) {
      return;
    }
    if (!document.fullscreenElement) {
      void examViewportRef.current?.requestFullscreen().catch(() => {
        // Ignore browser restrictions (e.g. denied fullscreen policy).
      });
    }
    const config = buildExamSimulatorConfig(formValues);
    sendExamConfig(config);
  }, [formValues, validationError, sendExamConfig]);

  const busy = isStreaming;
  const isGeneratingBusy = busy && !examSession;
  const isTakeTurnBusy = busy && !!examSession;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--background)]">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-8">
        <div className="mb-8 flex items-start gap-3">
          <div className="rounded-xl bg-[var(--secondary)] p-2.5 text-[var(--foreground)]">
            <ClipboardList className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
              {t("exam.title")}
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">
              {t("exam.subtitle")}
            </p>
          </div>
        </div>

        <div className="space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--secondary)]/40 p-5 md:p-6">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
              {t("exam.topic")}
            </span>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={2}
              placeholder={t("exam.topicPlaceholder")}
              className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
                {t("exam.duration")}
              </span>
              <input
                type="number"
                min={5}
                max={240}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
            </label>
            <div className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-medium text-[var(--foreground)]">
                {t("exam.generation")}
              </span>
              <div className="flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--foreground)]">
                  <input
                    type="radio"
                    name="exam-gen"
                    checked={generationSource === "topic_only"}
                    onChange={() => {
                      setGenerationSource("topic_only");
                      setDocIds("");
                      setUploadError(null);
                    }}
                    className="accent-[var(--foreground)]"
                  />
                  {t("exam.topicOnly")}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--foreground)]">
                  <input
                    type="radio"
                    name="exam-gen"
                    checked={generationSource === "topic_plus_docs"}
                    onChange={() => setGenerationSource("topic_plus_docs")}
                    className="accent-[var(--foreground)]"
                  />
                  {t("exam.topicPlusDocs")}
                </label>
              </div>
            </div>
          </div>

          {generationSource === "topic_plus_docs" && (
            <div className="space-y-4">
              <div className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
                  {t("exam.uploadKb")}
                </span>
                {kbsLoading ? (
                  <p className="text-sm text-[var(--muted-foreground)]">{t("exam.kbLoading")}</p>
                ) : knowledgeBases.length === 0 ? (
                  <p className="text-sm text-[var(--muted-foreground)]">{t("exam.uploadNoKb")}</p>
                ) : (
                  <select
                    value={uploadKb}
                    onChange={(e) => setUploadKb(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    {knowledgeBases.map((kb) => (
                      <option key={kb.name} value={kb.name}>
                        {kb.name}
                        {kb.is_default ? " *" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {knowledgeBases.length > 0 && uploadKb ? (
                <div>
                  <span className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
                    {t("exam.uploadDrop")}
                  </span>
                  <label
                    className={`flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors ${
                      dragOverUpload
                        ? "border-[var(--foreground)]/40 bg-[var(--background)]"
                        : "border-[var(--border)] bg-[var(--background)]/60 hover:border-[var(--foreground)]/25"
                    } ${uploadBusy ? "pointer-events-none opacity-60" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverUpload(true);
                    }}
                    onDragLeave={() => setDragOverUpload(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOverUpload(false);
                      const dropped = Array.from(e.dataTransfer.files || []);
                      void handleExamFiles(dropped);
                    }}
                  >
                    <Upload className="h-5 w-5 text-[var(--muted-foreground)]" aria-hidden />
                    <span className="text-[var(--muted-foreground)]">
                      {uploadBusy ? t("exam.uploadBusy") : t("exam.uploadDrop")}
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.txt,.md,.markdown,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      disabled={uploadBusy}
                      onChange={(e) => {
                        const fl = e.target.files;
                        if (fl?.length) void handleExamFiles(fl);
                      }}
                    />
                  </label>
                </div>
              ) : null}

              {uploadError ? (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {uploadError}
                </p>
              ) : null}

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
                  {t("exam.docIds")}
                </span>
                <input
                  type="text"
                  value={docIds}
                  onChange={(e) => setDocIds(e.target.value)}
                  placeholder={t("exam.docIdsPlaceholder")}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                />
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">{t("exam.docIdsHelp")}</p>
              </label>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["exam.mcq", mcq, setMcq] as const,
                ["exam.short", shortN, setShortN] as const,
                ["exam.long", longN, setLongN] as const,
              ] as const
            ).map(([labelKey, val, setVal]) => (
              <label key={labelKey} className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
                  {t(labelKey)}
                </span>
                <input
                  type="number"
                  min={0}
                  value={val}
                  onChange={(e) => setVal(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                />
              </label>
            ))}
          </div>

          {attemptedSubmit && validationError && validationMessage ? (
            <p className="text-sm text-amber-700 dark:text-amber-400" role="alert">
              {validationMessage}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleStart}
              disabled={isGeneratingBusy}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--foreground)] px-4 py-2.5 text-sm font-medium text-[var(--background)] transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGeneratingBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isGeneratingBusy ? t("exam.streaming") : t("exam.start")}
            </button>
            {isGeneratingBusy ? (
              <button
                type="button"
                onClick={() => {
                  const turnId = activeTurnIdRef.current;
                  if (!turnId) return;
                  sendThroughExamWs({ type: "cancel_turn", turn_id: turnId });
                  setIsStreaming(false);
                  setPendingExamTurn(null);
                  activeTurnIdRef.current = null;
                }}
                className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]"
              >
                {t("exam.cancel")}
              </button>
            ) : null}
          </div>
        </div>

        <div ref={examViewportRef} className="exam-fullscreen-viewport">
          {examSession ? (
            <ExamTakeSession
              key={examSession.attempt_id}
              topic={examSession.topic}
              attemptId={examSession.attempt_id}
              deadlineAt={examSession.deadline_at}
              questions={examSession.questions}
              answers={examAnswers}
              onAnswerChange={handleExamAnswerChange}
              saveStatus={saveStatus}
              saveError={saveError}
              isStreaming={isTakeTurnBusy && pendingExamTurn !== "save_answer"}
              examClosed={takeLocked}
              grading={grading}
              onRequestSubmit={submitExam}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
