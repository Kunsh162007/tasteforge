import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { recordRateLimitHeaders, resetQuota } from "@/lib/qloo/quota";
import { resetSingletons } from "@/lib/singleton";

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => undefined }));

const KEYS = ["LLM_PROVIDER", "QLOO_MODE", "LEDGER_SECRET"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  process.env.LLM_PROVIDER = "mock";
  process.env.QLOO_MODE = "mock";
  process.env.LEDGER_SECRET = "test-ledger-secret-0123456789";
  resetSingletons();
  resetQuota();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetSingletons();
  resetQuota();
});

const seedMonth = (remaining: number): void =>
  recordRateLimitHeaders(
    new Headers({ "x-month-ratelimit-remaining": String(remaining), "x-month-ratelimit-limit": "50000", "x-month-ratelimit-reset": "2548800" }),
  );

describe("/api/health quota", () => {
  it("reports null numbers before any live call and never leaks secrets", async () => {
    const body = (await (await health()).json()) as { qloo: Record<string, unknown> };
    expect(body.qloo.quota).toEqual({ monthRemaining: null, monthLimit: null, monthResetsAt: null });
    expect(JSON.stringify(body)).not.toMatch(/api[_-]?key"\s*:\s*"/i);
  });

  it("reports remaining, limit, and reset, informational only", async () => {
    seedMonth(1500);
    const body = (await (await health()).json()) as { qloo: { quota: Record<string, unknown> } };
    expect(body.qloo.quota).toMatchObject({ monthRemaining: 1500, monthLimit: 50000 });
    expect(typeof body.qloo.quota.monthResetsAt).toBe("string");
  });
});
