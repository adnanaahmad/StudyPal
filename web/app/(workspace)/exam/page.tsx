"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, Loader2, Upload, History, FileText, CheckCircle2, ChevronRight, Play, Sparkles, BookOpen, Plus } from "lucide-react";
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
      void examViewportRef.current?.requestFullscreen().catch(() => {});
    }
    const config = buildExamSimulatorConfig(formValues);
    sendExamConfig(config);
  }, [formValues, validationError, sendExamConfig]);

  const busy = isStreaming;
  const isGeneratingBusy = busy && !examSession;
  const isTakeTurnBusy = busy && !!examSession;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--background)] animate-fade-in relative">
      {/* Header Section */}
      <div className="relative z-20 flex items-center justify-between px-8 py-6 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md">
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-600 dark:text-emerald-400">
            <ClipboardList size={14} strokeWidth={2.5} />
            <span className="text-[11px] font-bold uppercase tracking-wider">{t("Workshop")}</span>
          </div>
          <h1 className="font-serif text-2xl font-medium tracking-tight text-[var(--foreground)]">
            {t("Exam Simulator")}
          </h1>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setExamSession(null)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              !examSession 
                ? "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed" 
                : "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95"
            }`}
          >
            <Plus size={16} />
            {t("New Exam")}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar: Context & Settings */}
        <div className="w-[320px] border-r border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col overflow-hidden">
          <div className="p-6 flex flex-col h-full gap-8">
            <div>
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <History size={12} />
                {t("Recent Activity")}
              </h2>
              <div className="py-12 text-center rounded-2xl bg-white/40 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700">
                <FileText className="mx-auto h-6 w-6 text-slate-300 mb-2 opacity-50" />
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{t("No recent attempts")}</p>
              </div>
            </div>

            <div>
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <BookOpen size={12} />
                {t("Quick Tips")}
              </h2>
              <ul className="space-y-3">
                <li className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 flex gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
                  Use detailed topics for better questions.
                </li>
                <li className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 flex gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
                  Topic + Docs provides the most accurate context.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900 relative overflow-hidden">
          {examSession ? (
            <div ref={examViewportRef} className="h-full overflow-y-auto">
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
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
              <div className="w-full max-w-2xl">
                <div className="mb-12 text-center">
                  <div className="w-20 h-20 bg-emerald-500/10 rounded-[32px] flex items-center justify-center mx-auto mb-6 shadow-inner">
                    <Sparkles className="w-10 h-10 text-emerald-600" />
                  </div>
                  <h2 className="font-serif text-3xl font-medium mb-3">{t("Start an Exam Session")}</h2>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">{t("Challenge yourself with AI-generated questions tailored to your goals.")}</p>
                </div>

                <div className="space-y-6 rounded-[40px] bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
                  {/* Topic Section */}
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t("Exam Topic")}</label>
                    <textarea 
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all placeholder:text-slate-300 min-h-[80px] resize-none"
                      placeholder={t("e.g., Organic Chemistry: Carbonyl Compounds")}
                      value={topic}
                      onChange={e => setTopic(e.target.value)}
                    />
                  </div>

                  {/* Settings Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t("Duration (min)")}</label>
                      <input 
                        type="number"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all"
                        value={duration}
                        onChange={e => setDuration(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t("Generation")}</label>
                      <div className="flex bg-white dark:bg-slate-900 rounded-2xl p-1 border border-slate-200 dark:border-slate-700">
                        <button 
                          onClick={() => setGenerationSource("topic_only")}
                          className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${generationSource === "topic_only" ? "bg-emerald-600 text-white shadow-md" : "text-slate-400 hover:text-slate-600"}`}
                        >
                          Topic
                        </button>
                        <button 
                          onClick={() => setGenerationSource("topic_plus_docs")}
                          className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${generationSource === "topic_plus_docs" ? "bg-emerald-600 text-white shadow-md" : "text-slate-400 hover:text-slate-600"}`}
                        >
                          +Docs
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Question Mix */}
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">{t("Question Mix")}</label>
                    <div className="grid grid-cols-3 gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-black text-slate-400 uppercase mb-1">MCQ</span>
                        <input type="number" className="w-12 text-center text-sm font-bold bg-slate-50 dark:bg-slate-800 rounded-lg py-1" value={mcq} onChange={e => setMcq(e.target.value)} />
                      </div>
                      <div className="flex flex-col items-center border-x border-slate-100 dark:border-slate-800">
                        <span className="text-[9px] font-black text-slate-400 uppercase mb-1">Short</span>
                        <input type="number" className="w-12 text-center text-sm font-bold bg-slate-50 dark:bg-slate-800 rounded-lg py-1" value={shortN} onChange={e => setShortN(e.target.value)} />
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-black text-slate-400 uppercase mb-1">Long</span>
                        <input type="number" className="w-12 text-center text-sm font-bold bg-slate-50 dark:bg-slate-800 rounded-lg py-1" value={longN} onChange={e => setLongN(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  {attemptedSubmit && validationError && validationMessage && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                      {validationMessage}
                    </div>
                  )}

                  <button 
                    onClick={handleStart}
                    disabled={isGeneratingBusy}
                    className="w-full flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-500 text-white h-14 rounded-2xl font-bold transition-all disabled:opacity-30 disabled:grayscale shadow-xl shadow-emerald-500/20 active:scale-[0.98]"
                  >
                    {isGeneratingBusy ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
                    {isGeneratingBusy ? t("Streaming...") : t("Start Simulation")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

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
