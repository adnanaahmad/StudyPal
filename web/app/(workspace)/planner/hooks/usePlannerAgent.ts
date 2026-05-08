"use client";

import {
  useCopilotAdditionalInstructions,
  useCopilotReadable,
  useFrontendTool,
} from "@copilotkit/react-core";
import { useClearCopilotChatOnUnmount } from "@/hooks/useClearCopilotChatOnUnmount";
import type {
  PlannerApi,
  StudyTaskEnergy,
  StudyTaskKind,
  StudyTaskStatus,
} from "./usePlannerState";

const TUTOR_INSTRUCTIONS = `
You are a planning coach building a concrete weekly study plan for the student.

The plan is a shared artifact. Use tools to create/update tasks instead of
describing a plan only in prose.

CRITICAL:
- Tool args must be FLAT objects with exact keys.
- Never wrap arguments under "task", "args", "input", or "params".
- If a tool returns { ok: false, error }, retry with corrected fields.

Workflow:
1) If planner is empty, call planner_set_meta first with goal and (if known) exam_date.
2) Add a realistic first draft of 5-10 tasks spread across upcoming days.
   - If the user asks for a "week plan", "weekly plan", or mentions several days,
     you MUST create at least 5 tasks before your first prose response.
   - If CURRENT_PLAN.taskCount is still below 5 for a weekly ask, continue calling
     planner_add_task until it reaches 5+.
3) Keep sessions short (15-45 mins) unless user asked for deep work blocks.
4) After scheduling, explain "why this now" briefly and ask for constraints.
5) Use planner_update_task / planner_complete_task as user progresses.
6) Date rule: Always set task dates relative to today; never use stale historical
   dates from examples. Prefer today/tomorrow and upcoming calendar days.

Style:
- Be concise and practical.
- Mention what changed after tool calls.
- Prefer actionable next step over long explanations.
`.trim();

const KINDS = new Set<StudyTaskKind>(["review", "practice", "lesson", "quiz"]);
const ENERGY = new Set<StudyTaskEnergy>(["low", "medium", "high"]);
const STATUS = new Set<StudyTaskStatus>(["pending", "completed", "missed"]);

export function usePlannerAgent(api: PlannerApi) {
  const { state } = api;

  useClearCopilotChatOnUnmount();

  useCopilotReadable(
    {
      description:
        "CURRENT_PLAN — live study planner state. Read before deciding which tasks to add, edit, or complete.",
      value: {
        goal: state.goal,
        examDate: state.examDate,
        weeklyMinutesGoal: state.weeklyMinutesGoal,
        availableMinutesToday: state.availableMinutesToday,
        selectedTaskId: state.selectedTaskId,
        taskCount: state.taskOrder.length,
        tasks: state.taskOrder.map((id) => state.tasks[id]),
      },
    },
    [state],
  );

  useCopilotAdditionalInstructions({ instructions: TUTOR_INSTRUCTIONS });

  const unwrap = (raw: Record<string, unknown> | null | undefined): Record<string, unknown> => {
    const input = (raw ?? {}) as Record<string, unknown>;
    for (const key of ["task", "args", "input", "params", "arguments"]) {
      const candidate = input[key];
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        return { ...(candidate as Record<string, unknown>), ...input };
      }
    }
    return input;
  };

  const str = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  const int = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.round(parsed);
    }
    return undefined;
  };
  const fail = (reason: string) => ({ ok: false, error: reason });

  useFrontendTool({
    name: "planner_set_meta",
    description: "Set high-level planning context (goal, exam_date, weekly goal, today's available minutes).",
    parameters: [
      { name: "goal", type: "string", description: "Main study goal.", required: false },
      { name: "exam_date", type: "string", description: "Target date in YYYY-MM-DD.", required: false },
      { name: "weekly_minutes_goal", type: "number", description: "Weekly study minutes target.", required: false },
      { name: "available_minutes_today", type: "number", description: "How many minutes the learner has today.", required: false },
    ],
    handler: (raw) => {
      const a = unwrap(raw as Record<string, unknown>);
      const goal = str(a.goal);
      const examDate = str(a.exam_date) ?? str((a as { examDate?: unknown }).examDate);
      const weeklyMinutesGoal = int(a.weekly_minutes_goal);
      const availableMinutesToday = int(a.available_minutes_today);
      api.setPlanMeta({ goal, examDate, weeklyMinutesGoal, availableMinutesToday });
      return { ok: true };
    },
  });

  useFrontendTool({
    name: "planner_add_task",
    description: "Add a study session to the plan.",
    parameters: [
      { name: "id", type: "string", description: "Optional slug id.", required: false },
      { name: "title", type: "string", description: "Task title.", required: true },
      { name: "subject", type: "string", description: "Subject area.", required: true },
      { name: "date", type: "string", description: "Session date (YYYY-MM-DD).", required: true },
      { name: "duration_min", type: "number", description: "Estimated duration in minutes.", required: true },
      { name: "reason", type: "string", description: "Why this task is prioritized.", required: false },
      { name: "kind", type: "string", enum: ["review", "practice", "lesson", "quiz"], required: false },
      { name: "energy", type: "string", enum: ["low", "medium", "high"], required: false },
    ],
    handler: (raw) => {
      const a = unwrap(raw as Record<string, unknown>);
      const title = str(a.title);
      const subject = str(a.subject);
      const date = str(a.date);
      const durationMin = int(a.duration_min);
      if (!title) return fail("title is required");
      if (!subject) return fail("subject is required");
      if (!date) return fail("date is required");
      if (!durationMin) return fail("duration_min is required");
      const kind = str(a.kind) as StudyTaskKind | undefined;
      const energy = str(a.energy) as StudyTaskEnergy | undefined;
      if (kind && !KINDS.has(kind)) return fail("kind must be review|practice|lesson|quiz");
      if (energy && !ENERGY.has(energy)) return fail("energy must be low|medium|high");
      const id = api.addTask({
        id: str(a.id),
        title,
        subject,
        date,
        durationMin,
        reason: str(a.reason),
        kind,
        energy,
      });
      return { ok: true, id };
    },
  });

  useFrontendTool({
    name: "planner_update_task",
    description: "Update fields of an existing task.",
    parameters: [
      { name: "id", type: "string", description: "Task id.", required: true },
      { name: "title", type: "string", required: false },
      { name: "subject", type: "string", required: false },
      { name: "date", type: "string", required: false },
      { name: "duration_min", type: "number", required: false },
      { name: "reason", type: "string", required: false },
      { name: "kind", type: "string", enum: ["review", "practice", "lesson", "quiz"], required: false },
      { name: "energy", type: "string", enum: ["low", "medium", "high"], required: false },
      { name: "status", type: "string", enum: ["pending", "completed", "missed"], required: false },
    ],
    handler: (raw) => {
      const a = unwrap(raw as Record<string, unknown>);
      const id = str(a.id);
      if (!id) return fail("id is required");
      const kind = str(a.kind) as StudyTaskKind | undefined;
      const energy = str(a.energy) as StudyTaskEnergy | undefined;
      const status = str(a.status) as StudyTaskStatus | undefined;
      if (kind && !KINDS.has(kind)) return fail("invalid kind");
      if (energy && !ENERGY.has(energy)) return fail("invalid energy");
      if (status && !STATUS.has(status)) return fail("invalid status");
      api.updateTask({
        id,
        title: str(a.title),
        subject: str(a.subject),
        date: str(a.date),
        durationMin: int(a.duration_min),
        reason: str(a.reason),
        kind,
        energy,
        status,
      });
      return { ok: true, id };
    },
  });

  useFrontendTool({
    name: "planner_complete_task",
    description: "Mark a task completed by id.",
    parameters: [{ name: "id", type: "string", description: "Task id.", required: true }],
    handler: (raw) => {
      const a = unwrap(raw as Record<string, unknown>);
      const id = str(a.id);
      if (!id) return fail("id is required");
      api.completeTask({ id });
      return { ok: true, id };
    },
  });

  useFrontendTool({
    name: "planner_remove_task",
    description: "Delete a task by id.",
    parameters: [{ name: "id", type: "string", description: "Task id.", required: true }],
    handler: (raw) => {
      const a = unwrap(raw as Record<string, unknown>);
      const id = str(a.id);
      if (!id) return fail("id is required");
      api.removeTask({ id });
      return { ok: true, id };
    },
  });

  useFrontendTool({
    name: "planner_select_task",
    description: "Select a task in UI by id (used to focus user's attention).",
    parameters: [{ name: "id", type: "string", description: "Task id.", required: true }],
    handler: (raw) => {
      const a = unwrap(raw as Record<string, unknown>);
      const id = str(a.id);
      if (!id) return fail("id is required");
      api.selectTask({ id });
      return { ok: true, id };
    },
  });
}
