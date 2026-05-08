"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  plannerStateFromStorage,
  plannerStateToStorage,
  PLANNER_STORAGE_KEY,
} from "./planner-storage";
import { normalizePlannerDate, resolvePlannerTaskDate } from "./planner-date";

export type StudyTaskStatus = "pending" | "completed" | "missed";
export type StudyTaskKind = "review" | "practice" | "lesson" | "quiz";
export type StudyTaskEnergy = "low" | "medium" | "high";

export interface StudyTask {
  id: string;
  title: string;
  subject: string;
  date: string; // YYYY-MM-DD in local planner context
  durationMin: number;
  reason?: string;
  kind: StudyTaskKind;
  energy: StudyTaskEnergy;
  status: StudyTaskStatus;
  completedAt?: string;
}

export interface PlannerState {
  goal: string | null;
  examDate: string | null; // YYYY-MM-DD
  weeklyMinutesGoal: number;
  availableMinutesToday: number;
  tasks: Record<string, StudyTask>;
  taskOrder: string[];
  selectedTaskId: string | null;
}

const EMPTY_STATE: PlannerState = {
  goal: null,
  examDate: null,
  weeklyMinutesGoal: 240,
  availableMinutesToday: 45,
  tasks: {},
  taskOrder: [],
  selectedTaskId: null,
};

const slugify = (value: string | undefined | null): string => {
  const input = (value ?? "").toString();
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || `task-${Math.random().toString(36).slice(2, 8)}`
  );
};

const clampDuration = (value: number): number => {
  if (!Number.isFinite(value)) return 25;
  return Math.max(5, Math.min(180, Math.round(value)));
};

const normalizeDate = (value: string): string => {
  return normalizePlannerDate(value);
};

const compareTasks = (a: StudyTask, b: StudyTask): number => {
  const dateDelta = a.date.localeCompare(b.date);
  if (dateDelta !== 0) return dateDelta;
  const doneWeight = (status: StudyTaskStatus) => (status === "completed" ? 2 : status === "missed" ? 1 : 0);
  const statusDelta = doneWeight(a.status) - doneWeight(b.status);
  if (statusDelta !== 0) return statusDelta;
  return a.title.localeCompare(b.title);
};

const sortTaskOrder = (
  tasks: Record<string, StudyTask>,
  currentOrder: string[],
): string[] => {
  return [...currentOrder].sort((idA, idB) => {
    const a = tasks[idA];
    const b = tasks[idB];
    if (!a || !b) return 0;
    return compareTasks(a, b);
  });
};

export interface PlannerApi {
  state: PlannerState;
  setPlanMeta: (args: {
    goal?: string;
    examDate?: string;
    weeklyMinutesGoal?: number;
    availableMinutesToday?: number;
  }) => void;
  addTask: (args: {
    id?: string;
    title: string;
    subject: string;
    date: string;
    durationMin: number;
    reason?: string;
    kind?: StudyTaskKind;
    energy?: StudyTaskEnergy;
  }) => string;
  updateTask: (args: {
    id: string;
    title?: string;
    subject?: string;
    date?: string;
    durationMin?: number;
    reason?: string;
    kind?: StudyTaskKind;
    energy?: StudyTaskEnergy;
    status?: StudyTaskStatus;
  }) => void;
  completeTask: (args: { id: string }) => void;
  removeTask: (args: { id: string }) => void;
  selectTask: (args: { id: string }) => void;
  reset: () => void;
}

export function usePlannerState(): PlannerApi {
  const [state, setState] = useState<PlannerState>(EMPTY_STATE);
  const hasHydrated = useRef(false);

  const setPlanMeta: PlannerApi["setPlanMeta"] = useCallback((args) => {
    setState((prev) => ({
      ...prev,
      ...(args.goal !== undefined ? { goal: args.goal || null } : {}),
      ...(args.examDate !== undefined ? { examDate: normalizeDate(args.examDate) } : {}),
      ...(args.weeklyMinutesGoal !== undefined
        ? { weeklyMinutesGoal: clampDuration(args.weeklyMinutesGoal * 1) }
        : {}),
      ...(args.availableMinutesToday !== undefined
        ? { availableMinutesToday: clampDuration(args.availableMinutesToday * 1) }
        : {}),
    }));
  }, []);

  const addTask: PlannerApi["addTask"] = useCallback((args) => {
    let chosenId = "";
    setState((prev) => {
      const desired = args.id ?? args.title;
      let candidate = slugify(desired);
      let idx = 2;
      while (prev.tasks[candidate]) {
        candidate = `${slugify(desired)}-${idx++}`;
      }
      chosenId = candidate;
      const task: StudyTask = {
        id: candidate,
        title: args.title,
        subject: args.subject,
        date: resolvePlannerTaskDate(
          args.date,
          prev.taskOrder.map((id) => prev.tasks[id]?.date).filter(Boolean) as string[],
        ),
        durationMin: clampDuration(args.durationMin),
        reason: args.reason,
        kind: args.kind ?? "review",
        energy: args.energy ?? "medium",
        status: "pending",
      };
      const tasks = { ...prev.tasks, [candidate]: task };
      const taskOrder = sortTaskOrder(tasks, [...prev.taskOrder, candidate]);
      return {
        ...prev,
        tasks,
        taskOrder,
        selectedTaskId: prev.selectedTaskId ?? candidate,
      };
    });
    return chosenId;
  }, []);

  const updateTask: PlannerApi["updateTask"] = useCallback((args) => {
    setState((prev) => {
      const existing = prev.tasks[args.id];
      if (!existing) return prev;
      const nextTask: StudyTask = {
        ...existing,
        ...(args.title !== undefined ? { title: args.title } : {}),
        ...(args.subject !== undefined ? { subject: args.subject } : {}),
        ...(args.date !== undefined
          ? {
              date: resolvePlannerTaskDate(
                args.date,
                prev.taskOrder
                  .filter((taskId) => taskId !== args.id)
                  .map((taskId) => prev.tasks[taskId]?.date)
                  .filter(Boolean) as string[],
              ),
            }
          : {}),
        ...(args.durationMin !== undefined ? { durationMin: clampDuration(args.durationMin) } : {}),
        ...(args.reason !== undefined ? { reason: args.reason } : {}),
        ...(args.kind !== undefined ? { kind: args.kind } : {}),
        ...(args.energy !== undefined ? { energy: args.energy } : {}),
        ...(args.status !== undefined ? { status: args.status } : {}),
      };
      const tasks = { ...prev.tasks, [args.id]: nextTask };
      const taskOrder = sortTaskOrder(tasks, prev.taskOrder);
      return { ...prev, tasks, taskOrder };
    });
  }, []);

  const completeTask: PlannerApi["completeTask"] = useCallback(({ id }) => {
    setState((prev) => {
      const existing = prev.tasks[id];
      if (!existing) return prev;
      const tasks = {
        ...prev.tasks,
        [id]: {
          ...existing,
          status: "completed",
          completedAt: new Date().toISOString(),
        },
      };
      const taskOrder = sortTaskOrder(tasks, prev.taskOrder);
      return { ...prev, tasks, taskOrder };
    });
  }, []);

  const removeTask: PlannerApi["removeTask"] = useCallback(({ id }) => {
    setState((prev) => {
      if (!prev.tasks[id]) return prev;
      const tasks = { ...prev.tasks };
      delete tasks[id];
      const taskOrder = prev.taskOrder.filter((taskId) => taskId !== id);
      const selectedTaskId =
        prev.selectedTaskId === id ? (taskOrder[0] ?? null) : prev.selectedTaskId;
      return { ...prev, tasks, taskOrder, selectedTaskId };
    });
  }, []);

  const selectTask: PlannerApi["selectTask"] = useCallback(({ id }) => {
    setState((prev) => (prev.tasks[id] ? { ...prev, selectedTaskId: id } : prev));
  }, []);

  const reset: PlannerApi["reset"] = useCallback(() => {
    setState(EMPTY_STATE);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(PLANNER_STORAGE_KEY);
    if (!raw) {
      hasHydrated.current = true;
      return;
    }
    const restored = plannerStateFromStorage(raw);
    if (restored) {
      setState(restored);
    }
    hasHydrated.current = true;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasHydrated.current) return;
    window.localStorage.setItem(PLANNER_STORAGE_KEY, plannerStateToStorage(state));
  }, [state]);

  return useMemo(
    () => ({
      state,
      setPlanMeta,
      addTask,
      updateTask,
      completeTask,
      removeTask,
      selectTask,
      reset,
    }),
    [state, setPlanMeta, addTask, updateTask, completeTask, removeTask, selectTask, reset],
  );
}
