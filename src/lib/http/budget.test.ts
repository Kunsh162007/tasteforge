import { describe, expect, it } from "vitest";
import { budgetFromEnv, createBudget } from "./budget";

describe("createBudget", () => {
  it("caps concurrent runs and frees a slot on release (once)", () => {
    const b = createBudget({ maxConcurrent: 2 });
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
});

describe("budgetFromEnv", () => {
  it("reads the cap from the environment and ignores invalid values", () => {
    const b = budgetFromEnv({ MAX_CONCURRENT_BRIEFS: "1" });
    expect(b.admit().ok).toBe(true);
    expect(b.admit()).toMatchObject({ ok: false, reason: "busy" });
    const d = budgetFromEnv({ MAX_CONCURRENT_BRIEFS: "abc" });
    for (let i = 0; i < 4; i += 1) expect(d.admit().ok).toBe(true);
    expect(d.admit()).toMatchObject({ ok: false, reason: "busy" });
  });
});
