"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopilotSidebar } from "@copilotkit/react-ui";
import { CalendarClock, CheckCircle2, Clock3, Copy, Flame, Sparkles } from "lucide-react";
import { useCopilotSidebarSessionKey } from "@/hooks/useClearCopilotChatOnUnmount";
import { usePlannerAgent } from "./hooks/usePlannerAgent";
import { usePlannerState } from "./hooks/usePlannerState";


export default function PlannerPage() {
  const { t } = useTranslation();
  const api = usePlannerState();
  usePlannerAgent(api);
  const copilotSidebarKey = useCopilotSidebarSessionKey();
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);

  const isEmpty = api.state.taskOrder.length === 0;
  const [today, setToday] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setToday(new Date().toISOString().slice(0, 10));
    setMounted(true);
  }, []);
  const tasks = useMemo(() => api.state.taskOrder.map((id) => api.state.tasks[id]), [api.state]);
  const todayTasks = useMemo(() => tasks.filter((task) => task.date === today), [tasks, today]);
  const completedToday = todayTasks.filter((task) => task.status === "completed").length;
  const minutesToday = todayTasks.reduce((sum, task) => sum + task.durationMin, 0);
  const completionRate = todayTasks.length ? Math.round((completedToday / todayTasks.length) * 100) : 0;
  const nextTask = tasks.find((task) => task.status === "pending") ?? null;

  const starterPrompts = [
    "Create a 3-day study plan (30 mins/day) for an Algorithms exam. Divide the schedule among Brute Force, Greedy Algorithms, Dynamic Programming, and Backtracking.",
    "Create a 10-day study plan (45 mins/day) for a Calculus exam. Focus on key topics like Limits, Derivatives, Integrals, and their practical applications.",
    "I missed yesterday's scheduled sessions. Please replan the remaining week intelligently, adapting the upcoming daily durations to fit my time limits.",
  ];

  const handleCopyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedPrompt(prompt);
      setTimeout(() => setCopiedPrompt(null), 1200);
    } catch {
      // Clipboard can fail in restricted contexts; silently ignore.
    }
  };

  return (
    <div suppressHydrationWarning className="flex h-full flex-col overflow-hidden bg-[var(--background)]">
      <div suppressHydrationWarning className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 md:px-6">
        <div suppressHydrationWarning className="min-w-0">
          <h1 className="truncate text-base font-semibold text-[var(--foreground)]">
            {t("Study Planner")}
          </h1>
          <p className="text-xs text-[var(--muted-foreground)]">
            {t("Your adaptive learning OS for daily momentum")}
          </p>
        </div>
        <button
          onClick={api.reset}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)]"
        >
          {t("New plan")}
        </button>
      </div>

      <div suppressHydrationWarning className="relative flex flex-1 overflow-hidden">
        {!mounted ? (
          <div suppressHydrationWarning className="flex-1 animate-pulse bg-[var(--background)]" />
        ) : (
          <>
            <div className="flex flex-1 flex-col overflow-y-auto p-4 md:p-6">
              <div className="grid gap-3 md:grid-cols-3">
                <MetricCard
                  icon={CalendarClock}
                  label={t("Sessions Today")}
                  value={`${todayTasks.length}`}
                  subtext={t("{{mins}} min scheduled", { mins: minutesToday })}
                />
                <MetricCard
                  icon={CheckCircle2}
                  label={t("Completed")}
                  value={`${completedToday}`}
                  subtext={t("{{rate}}% completion", { rate: completionRate })}
                />
                <MetricCard
                  icon={Flame}
                  label={t("Focus Budget")}
                  value={`${api.state.availableMinutesToday}m`}
                  subtext={t("Available time today")}
                />
              </div>

              {isEmpty ? (
                <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--card)]/95 p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--secondary)] text-[var(--primary)]">
                      <CalendarClock size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
                        {t("Learning OS")}
                      </h2>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                        {t(
                          "Tell the planner your goal, exam date, and available time. It will build a realistic week plan and adapt when your schedule changes.",
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-2 sm:grid-cols-3">
                    <MiniFeature
                      icon={Clock3}
                      title={t("Auto Scheduling")}
                      text={t("Breaks goals into daily sessions that fit your real time budget.")}
                    />
                    <MiniFeature
                      icon={Sparkles}
                      title={t("Smart Replans")}
                      text={t("If you miss a day, ask the agent to rebalance the week instantly.")}
                    />
                    <MiniFeature
                      icon={CheckCircle2}
                      title={t("Action First")}
                      text={t("Always know your next best study block and why it matters now.")}
                    />
                  </div>

                  <div className="mt-5">
                    <p className="mb-2 text-xs font-medium text-[var(--muted-foreground)]">
                      {t("Suggested prompts (copy to chat)")}
                    </p>
                    <div className="space-y-2">
                      {starterPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => void handleCopyPrompt(prompt)}
                          className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--secondary)]"
                        >
                          <span>{prompt}</span>
                          <span className="ml-3 inline-flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]">
                            <Copy size={12} />
                            {copiedPrompt === prompt ? t("Copied") : t("Copy")}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                  <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]/80 p-4">
                    <h3 className="text-sm font-semibold text-[var(--foreground)]">{t("This Week")}</h3>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                      {t("Goal: {{goal}}", { goal: api.state.goal ?? "Not set yet" })}
                    </p>
                    <div className="mt-3 space-y-2">
                      {tasks.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => api.selectTask({ id: task.id })}
                          className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${api.state.selectedTaskId === task.id
                            ? "border-[var(--primary)] bg-[var(--primary)]/5"
                            : "border-[var(--border)] bg-[var(--background)] hover:bg-[var(--secondary)]"
                            }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-xs font-medium text-[var(--foreground)]">{task.title}</p>
                            <span className="shrink-0 text-[10px] text-[var(--muted-foreground)]">
                              {task.durationMin}m
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
                            <span>{task.subject}</span>
                            <span>{task.date}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)]/80 p-4">
                    <h3 className="text-sm font-semibold text-[var(--foreground)]">{t("Next Best Session")}</h3>
                    {nextTask ? (
                      <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                        <p className="text-sm font-semibold text-[var(--foreground)]">{nextTask.title}</p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {nextTask.subject} • {nextTask.durationMin}m • {nextTask.date}
                        </p>
                        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                          {nextTask.reason ?? t("No rationale yet. Ask the agent: why this task now?")}
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => api.completeTask({ id: nextTask.id })}
                            className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-[var(--primary-foreground)]"
                          >
                            {t("Mark done")}
                          </button>
                          <button
                            onClick={() => api.updateTask({ id: nextTask.id, status: "missed" })}
                            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted-foreground)]"
                          >
                            {t("Missed")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                        {t("All tasks are completed. Ask the planner to generate the next set.")}
                      </p>
                    )}
                  </section>
                </div>
              )}
            </div>

            <div className="planner-chat-clean">
              <CopilotSidebar
                key={copilotSidebarKey}
                defaultOpen={false}
                clickOutsideToClose={true}
                labels={{
                  title: "",
                  initial: t(
                    "Hi! I can build and adapt your study plan. Tell me your goal, exam date, and available time.",
                  ),
                  placeholder: t("Ask me to create, rebalance, or optimize your study week..."),
                }}
              />
            </div>
          </>
        )}
      </div>

      <style jsx global>{`
        .planner-chat-clean .copilotKitDevConsole,
        .planner-chat-clean .copilotKitHeaderControls > .copilotKitDevConsole {
          display: none !important;
        }
        .planner-chat-clean button[aria-label="Open Help"],
        .planner-chat-clean .copilotKitDebugMenuTriggerButton {
          display: none !important;
        }
        .planner-chat-clean .copilotKitHeaderControls {
          gap: 0 !important;
        }
        .planner-chat-clean .copilotKitHeaderControls .copilotKitHeaderCloseButton {
          margin-left: auto;
        }
        .planner-chat-clean .copilotKitHeader {
          border-bottom: none !important;
        }
        .planner-chat-clean a[href*="copilotkit"],
        .planner-chat-clean [data-testid="copilotkit-footer-branding"] {
          display: none !important;
        }
      `}</style>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  subtext,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <div suppressHydrationWarning className="rounded-xl border border-[var(--border)] bg-[var(--card)]/80 p-3">
      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
        <Icon size={14} />
        <p className="text-[11px] font-medium">{label}</p>
      </div>
      <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">{value}</p>
      <p className="text-[11px] text-[var(--muted-foreground)]">{subtext}</p>
    </div>
  );
}

function MiniFeature({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Clock3;
  title: string;
  text: string;
}) {
  return (
    <div suppressHydrationWarning className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
      <Icon size={15} className="mb-1 text-[var(--primary)]" />
      <p className="text-xs font-medium text-[var(--foreground)]">{title}</p>
      <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">{text}</p>
    </div>
  );
}
