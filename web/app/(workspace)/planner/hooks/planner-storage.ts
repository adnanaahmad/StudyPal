import type { PlannerState } from "./usePlannerState";

export type PlannerStorageState = PlannerState;

export const PLANNER_STORAGE_KEY = "deeptutor.study_planner.v1";

export function plannerStateToStorage(state: PlannerStorageState): string {
  return JSON.stringify(state);
}

export function plannerStateFromStorage(raw: string): PlannerStorageState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PlannerStorageState>;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.tasks || typeof parsed.tasks !== "object") return null;
    if (!Array.isArray(parsed.taskOrder)) return null;
    return {
      goal: typeof parsed.goal === "string" ? parsed.goal : null,
      examDate: typeof parsed.examDate === "string" ? parsed.examDate : null,
      weeklyMinutesGoal:
        typeof parsed.weeklyMinutesGoal === "number" ? parsed.weeklyMinutesGoal : 240,
      availableMinutesToday:
        typeof parsed.availableMinutesToday === "number"
          ? parsed.availableMinutesToday
          : 45,
      tasks: parsed.tasks as PlannerStorageState["tasks"],
      taskOrder: parsed.taskOrder as string[],
      selectedTaskId:
        typeof parsed.selectedTaskId === "string" ? parsed.selectedTaskId : null,
    };
  } catch {
    return null;
  }
}

