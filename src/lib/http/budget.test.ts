import { describe, expect, it } from "vitest";
import { budgetFromEnv, createBudget } from "./budget";

describe("createBudget", () => {
  it("caps concurrent runs and frees a slot on release (once)", () => {
    const b = createBudget({ maxConcurrent: 2, dailyCalls: 100 });
    const a = b.admit();
    const c = b.admit();
    expect(a.ok && c.ok).toBe(true);
    const third = b.admit();
    expect(third).toMatchObject({ ok: false, reason: "busy" });
    if (a.ok) {
      a.release();
      a.release();
    }
    expect(b.snapshot().active).toBe(1);
    expect(b.admit().ok).toBe(true);
  });

  it("refuses new runs once the daily LLM budget is spent, and resets on the next UTC day", () => {
    let t = Date.UTC(2026, 9, 18, 12);
    const b = createBudget({ maxConcurrent: 4, dailyCalls: 3, now: () => t });
    for (let i = 0; i < 3; i += 1) b.recordCall();
    const refused = b.admit();
    expect(refused).toMatchObject({ ok: false, reason: "daily_budget" });
    if (!refused.ok) {
      expect(refused.retryAfterSeconds).toBe(12 * 3600);
      expect(refused.message).toMatch(/tomorrow/i);
    }
    t = Date.UTC(2026, 9, 19, 0, 0, 1);
    expect(b.admit().ok).toBe(true);
    expect(b.snapshot().callsToday).toBe(0);
  });
});

describe("budgetFromEnv", () => {
  it("reads the limits from the environment and ignores invalid values", () => {
    const b = budgetFromEnv({ MAX_CONCURRENT_BRIEFS: "1", DAILY_LLM_BUDGET: "abc" });
    expect(b.admit().ok).toBe(true);
    expect(b.admit()).toMatchObject({ ok: false, reason: "busy" });
    const d = budgetFromEnv({ DAILY_LLM_BUDGET: "1" });
    d.recordCall();
    expect(d.admit()).toMatchObject({ ok: false, reason: "daily_budget" });
  });
});
