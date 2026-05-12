import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePlannerDate,
  resolvePlannerTaskDate,
} from "../app/(workspace)/planner/hooks/planner-date.ts";

test("normalizePlannerDate converts even near-past date to today", () => {
  const today = "2026-05-08";
  const result = normalizePlannerDate("2026-05-07", today);
  assert.equal(result, today);
});

test("normalizePlannerDate converts very stale date to today", () => {
  const today = "2026-05-08";
  const result = normalizePlannerDate("2023-10-07", today);
  assert.equal(result, today);
});

test("normalizePlannerDate converts invalid date to today", () => {
  const today = "2026-05-08";
  const result = normalizePlannerDate("not-a-date", today);
  assert.equal(result, today);
});

test("resolvePlannerTaskDate keeps valid provided dates", () => {
  const today = "2026-05-08";
  const result = resolvePlannerTaskDate("2026-05-10", ["2026-05-08"], today);
  assert.equal(result, "2026-05-10");
});

test("resolvePlannerTaskDate spreads stale dates across free days", () => {
  const today = "2026-05-08";
  const first = resolvePlannerTaskDate("2023-10-06", [], today);
  const second = resolvePlannerTaskDate("2023-10-08", [first], today);
  const third = resolvePlannerTaskDate("2023-10-09", [first, second], today);
  assert.equal(first, "2026-05-08");
  assert.equal(second, "2026-05-09");
  assert.equal(third, "2026-05-10");
});

