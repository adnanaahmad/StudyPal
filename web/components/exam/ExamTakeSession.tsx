"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Loader2, Maximize2, Minimize2, Send } from "lucide-react";
import type { ExamGradingSummary, ExamQuestionPublic } from "@/lib/exam-simulator-types";

export interface ExamTakeSessionProps {
  topic: string;
  attemptId: string;
  deadlineAt: number;
  questions: ExamQuestionPublic[];
  answers: Record<string, string>;
  onAnswerChange: (questionId: string, value: string) => void;
  saveStatus: "idle" | "saving" | "saved" | "error";
  saveError: string | null;
  isStreaming: boolean;
  examClosed: boolean;
  grading: ExamGradingSummary | null;
  onRequestSubmit: () => void;
}

export function ExamTakeSession({
  topic,
  attemptId,
  deadlineAt,
  questions,
  answers,
  onAnswerChange,
  saveStatus,
  saveError,
  isStreaming,
  examClosed,
  grading,
  onRequestSubmit,
}: ExamTakeSessionProps) {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  const [remainingSec, setRemainingSec] = useState(() =>
    Math.max(0, Math.floor(deadlineAt - Date.now() / 1000)),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [gradingVisible, setGradingVisible] = useState(false);
  const autoSubmitSentRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const migratedFullscreenTargetRef = useRef(false);

  useEffect(() => {
    const tick = () => {
      setRemainingSec(Math.max(0, Math.floor(deadlineAt - Date.now() / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [deadlineAt]);

  useEffect(() => {
    if (
      remainingSec > 0 ||
      examClosed ||
      grading ||
      isStreaming ||
      autoSubmitSentRef.current
    ) {
      return;
    }
    autoSubmitSentRef.current = true;
    onRequestSubmit();
  }, [remainingSec, examClosed, grading, isStreaming, onRequestSubmit]);

  useEffect(() => {
    const onChange = () => {
      const fsEl = document.fullscreenElement;
      const root = containerRef.current;
      if (!fsEl) {
        migratedFullscreenTargetRef.current = false;
      }
      const inExamFullscreen = !!(
        fsEl &&
        root &&
        (fsEl === root || fsEl.contains(root) || root.contains(fsEl))
      );
      setIsFullscreen(inExamFullscreen);

      // If parent wrapper entered fullscreen first, migrate target to the actual exam card.
      if (
        fsEl &&
        root &&
        fsEl !== root &&
        fsEl.contains(root) &&
        !migratedFullscreenTargetRef.current
      ) {
        migratedFullscreenTargetRef.current = true;
        void root.requestFullscreen().catch(() => {
          // Ignore browser restrictions; parent fullscreen still stays active.
        });
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    onChange();
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const handleFullscreenToggle = useCallback(async () => {
    try {
      const fsEl = document.fullscreenElement;
      const root = containerRef.current;
      const inExamFullscreen = !!(
        fsEl &&
        root &&
        (fsEl === root || fsEl.contains(root) || root.contains(fsEl))
      );
      if (inExamFullscreen) {
        await document.exitFullscreen();
        return;
      }
      await containerRef.current?.requestFullscreen();
    } catch {
      // noop: browser/user gesture restrictions
    }
  }, []);

  useEffect(() => {
    if (!grading || gradingVisible) return;
    const t = window.setTimeout(() => {
      setGradingVisible(true);
    }, 1400);
    return () => window.clearTimeout(t);
  }, [grading, gradingVisible]);

  const active = questions[activeIndex];
  const answeredCount = useMemo(() => {
    let n = 0;
    for (const q of questions) {
      const v = (answers[q.question_id] ?? "").trim();
      if (v !== "") n += 1;
    }
    return n;
  }, [answers, questions]);

  const formatClock = useCallback((sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, []);

  const navButtonClass = (idx: number) => {
    const q = questions[idx];
    const filled = (answers[q.question_id] ?? "").trim() !== "";
    const isActive = idx === activeIndex;
    return [
      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95",
      isActive
        ? "bg-[var(--foreground)] text-[var(--background)] shadow-lg shadow-slate-900/10 dark:shadow-none"
        : filled
          ? "border border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
          : "border border-dashed border-[var(--border)] text-[var(--muted-foreground)] hover:border-slate-400 dark:hover:border-slate-500",
    ].join(" ");
  };

  return (
    <div
      ref={containerRef}
      className={`exam-take-root space-y-4 bg-transparent p-4 md:p-6 lg:px-8 ${
        isFullscreen ? "mt-0 min-h-full md:p-8" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">{t("exam.take.title")}</h2>
          <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
            {topic}{" "}
            <span className="text-xs opacity-80">
              ({t("exam.take.attempt")}: {attemptId.slice(0, 8)}…)
            </span>
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleFullscreenToggle()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--secondary)]"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {isFullscreen ? t("exam.take.exitFullscreen") : t("exam.take.fullscreen")}
          </button>
          <div
            className={`rounded-lg px-3 py-1.5 text-sm font-mono font-medium tabular-nums ${
            remainingSec <= 120 && !examClosed && !grading
              ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
              : "bg-[var(--secondary)] text-[var(--foreground)]"
          }`}
            role="timer"
            aria-live="polite"
          >
            {examClosed || grading ? t("exam.take.timeStopped") : formatClock(remainingSec)}
          </div>
        </div>
      </div>

      {!isFullscreen && !grading && !examClosed ? (
        <p className="text-xs text-[var(--muted-foreground)]">{t("exam.take.fullscreenHint")}</p>
      ) : null}

      {remainingSec <= 0 && !grading && !examClosed ? (
        <p className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {t("exam.take.autoSubmitting")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-3">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          {t("exam.take.navigator")}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {questions.map((q, idx) => (
            <button
              key={q.question_id}
              type="button"
              className={navButtonClass(idx)}
              onClick={() => setActiveIndex(idx)}
              aria-label={t("exam.take.goToQuestion", { n: idx + 1 })}
            >
              {idx + 1}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-[var(--muted-foreground)]">
          {t("exam.take.answeredOf", { answered: answeredCount, total: questions.length })}
        </span>
      </div>

      {active ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <span className="rounded-md bg-[var(--secondary)] px-2 py-0.5 font-medium uppercase text-[var(--foreground)]">
              {active.type}
            </span>
            <span>
              {t("exam.take.marks", { marks: active.marks })}
            </span>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--foreground)]">
            {active.prompt}
          </p>
          {active.type === "mcq" && active.options.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="sr-only">{t("exam.take.mcqLegend")}</legend>
              {active.options.map((opt, i) => {
                const letter = String.fromCharCode(65 + i);
                const id = `${active.question_id}-${letter}`;
                return (
                  <label
                    key={letter}
                    htmlFor={id}
                    className="flex min-w-0 cursor-pointer gap-4 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 text-sm transition-all hover:border-emerald-500/30 hover:bg-slate-50 dark:hover:bg-slate-800/50 has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-500/5 has-[:checked]:ring-1 has-[:checked]:ring-emerald-500/20"
                  >
                    <input
                      id={id}
                      type="radio"
                      name={active.question_id}
                      className="mt-1 h-4 w-4 accent-emerald-600"
                      checked={(answers[active.question_id] ?? "") === letter}
                      disabled={examClosed || !!grading}
                      onChange={() => onAnswerChange(active.question_id, letter)}
                    />
                    <span className="min-w-0 break-words leading-relaxed">
                      <span className="font-bold text-[var(--foreground)]">{letter}.</span>{" "}
                      <span className="text-[var(--foreground)]">{opt}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ) : (
            <textarea
              value={answers[active.question_id] ?? ""}
              onChange={(e) => onAnswerChange(active.question_id, e.target.value)}
              disabled={examClosed || !!grading}
              rows={active.type === "long" ? 12 : 5}
              className="w-full resize-y rounded-2xl border border-[var(--border)] bg-[var(--background)] px-5 py-4 text-sm text-[var(--foreground)] outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all disabled:opacity-60"
              placeholder={t("exam.take.textPlaceholder")}
            />
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-3">
        <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]" aria-live="polite">
          {saveStatus === "saving" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t("exam.take.saving")}
            </>
          ) : saveStatus === "saved" ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              {t("exam.take.saved")}
            </>
          ) : saveStatus === "error" ? (
            <span className="text-red-600 dark:text-red-400">{saveError || t("exam.take.saveFailed")}</span>
          ) : (
            <span>{t("exam.take.autosaveHint")}</span>
          )}
        </div>
        <button
          type="button"
          disabled={isStreaming || examClosed || !!grading || remainingSec <= 0}
          onClick={() => setConfirmOpen(true)}
          className="ml-auto inline-flex items-center gap-2 rounded-lg bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden />
          {t("exam.take.submit")}
        </button>
      </div>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exam-submit-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-lg">
            <h3 id="exam-submit-title" className="text-base font-semibold text-[var(--foreground)]">
              {t("exam.take.confirmTitle")}
            </h3>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">{t("exam.take.confirmBody")}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)]"
                onClick={() => setConfirmOpen(false)}
              >
                {t("exam.take.confirmCancel")}
              </button>
              <button
                type="button"
                className="rounded-lg bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)]"
                onClick={() => {
                  setConfirmOpen(false);
                  onRequestSubmit();
                }}
              >
                {t("exam.take.confirmSubmit")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {grading && !gradingVisible ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 text-center">
          <div className="mx-auto mb-3 h-10 w-10">
            <Loader2 className="h-10 w-10 animate-spin text-[var(--foreground)]" aria-hidden />
          </div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">{t("exam.take.finishingTitle")}</h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{t("exam.take.finishingBody")}</p>
        </div>
      ) : null}

      {grading && gradingVisible ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">{t("exam.take.resultsTitle")}</h3>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            {t("exam.take.scoreSummary", {
              total: grading.total,
              max: grading.max_total,
              pct: grading.percentage,
            })}
          </p>
          <ul className="mt-3 h-auto space-y-2 text-xs">
            {(grading.questions ?? []).map((row) => (
              <li
                key={row.question_id}
                className="rounded-lg border border-[var(--border)] bg-[var(--secondary)]/40 p-2"
              >
                <span className="font-medium text-[var(--foreground)]">{row.question_id}</span>
                <span className="text-[var(--muted-foreground)]">
                  {" "}
                  — {row.awarded}/{row.max_marks}
                </span>
                <p className="mt-1 text-[var(--muted-foreground)]">{row.feedback}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
