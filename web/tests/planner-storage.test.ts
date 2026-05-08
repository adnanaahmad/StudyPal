import test from "node:test";
import assert from "node:assert/strict";
import {
  plannerStateFromStorage,
  plannerStateToStorage,
  type PlannerStorageState,
} from "../app/(workspace)/planner/hooks/planner-storage.ts";

const sampleState: PlannerStorageState = {
  goal: "Ace calculus final",
  examDate: "2026-06-01",
  weeklyMinutesGoal: 300,
  availableMinutesToday: 50,
  tasks: {
    "limits-drill": {
      id: "limits-drill",
      title: "Limits problem drill",
      subject: "Calculus",
      date: "2026-05-10",
      durationMin: 25,
      reason: "high-miss area",
      kind: "practice",
      energy: "medium",
      status: "pending",
    },
  },
  taskOrder: ["limits-drill"],
  selectedTaskId: "limits-drill",
};

test("plannerStateToStorage serializes planner state to JSON", () => {
  const json = plannerStateToStorage(sampleState);
  assert.equal(typeof json, "string");
  const parsed = JSON.parse(json) as PlannerStorageState;
  assert.equal(parsed.goal, "Ace calculus final");
  assert.equal(parsed.taskOrder[0], "limits-drill");
});

test("plannerStateFromStorage restores state from valid JSON", () => {
  const json = JSON.stringify(sampleState);
  const restored = plannerStateFromStorage(json);
  assert.ok(restored);
  assert.equal(restored?.weeklyMinutesGoal, 300);
  assert.equal(restored?.tasks["limits-drill"]?.title, "Limits problem drill");
});

test("plannerStateFromStorage returns null for invalid payload", () => {
  const restored = plannerStateFromStorage("{ invalid-json ");
  assert.equal(restored, null);
});

