import { test, expect } from "@playwright/test";

const BASE_URL =
  process.env.WEB_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://localhost:3000";

test.describe("Exam Simulator :: 5-minute shell", () => {
  test("generates attempt with 5-minute deadline in Last run JSON", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto(`${BASE_URL}/exam`);
    await expect(page.getByRole("heading", { name: "Exam Simulator" })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByLabel("Topic or syllabus").fill("Manual audit: linear algebra basics");
    await page.getByLabel("Duration (minutes)").fill("5");

    await page.getByRole("button", { name: "Generate exam shell" }).click();

    const resultPre = page.locator("section pre").filter({ hasText: /attempt_id/ });
    await expect(resultPre).toBeVisible({ timeout: 60_000 });

    const text = await resultPre.textContent();
    expect(text).toBeTruthy();
    const parsed = JSON.parse(text!) as Record<string, unknown>;
    expect(parsed.attempt_id).toBeTruthy();
    expect(parsed.deadline_at).toBeTruthy();
    expect(parsed.template_id).toBeTruthy();
    const started = Number(parsed.started_at);
    const deadline = Number(parsed.deadline_at);
    expect(Number.isFinite(started) && Number.isFinite(deadline)).toBe(true);
    // 5 minutes in seconds (server uses float epoch seconds)
    expect(deadline - started).toBeCloseTo(300, 0);
  });
});
