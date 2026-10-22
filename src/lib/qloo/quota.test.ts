import { beforeEach, describe, expect, it } from "vitest";
import {
  formatQuotaLine,
  getQuota,
  quotaSummary,
  recordRateLimitHeaders,
  resetQuota,
  secondWaitMs,
} from "./quota";

const headers = (h: Record<string, string>): Headers => new Headers(h);

beforeEach(() => resetQuota());

describe("rate-limit header store", () => {
  it("starts empty", () => {
    expect(getQuota()).toEqual({});
  });

  it("records month and second values with timestamps and derives reset times", () => {
    recordRateLimitHeaders(
      headers({
        "x-month-ratelimit-limit": "50000",
        "x-month-ratelimit-remaining": "42900",
        "x-month-ratelimit-reset": "2548800",
        "x-second-ratelimit-limit": "10",
        "x-second-ratelimit-remaining": "7",
        "x-second-ratelimit-reset": "1",
      }),
      1_000,
    );
    const q = getQuota();
    expect(q.month).toEqual({ limit: 50000, remaining: 42900, resetsAt: 1_000 + 2_548_800_000, observedAt: 1_000 });
    expect(q.second).toEqual({ limit: 10, remaining: 7, resetsAt: 2_000, observedAt: 1_000 });
  });

  it("replaces the state immutably and ignores responses without the headers", () => {
    recordRateLimitHeaders(headers({ "x-month-ratelimit-remaining": "100", "x-month-ratelimit-limit": "50000" }), 1);
    const before = getQuota();
    recordRateLimitHeaders(headers({}), 2);
    expect(getQuota()).toBe(before);
    recordRateLimitHeaders(headers({ "x-month-ratelimit-remaining": "99", "x-month-ratelimit-limit": "50000" }), 3);
    expect(getQuota()).not.toBe(before);
    expect(before.month?.remaining).toBe(100);
    expect(getQuota().month?.remaining).toBe(99);
  });

  it("ignores garbage values", () => {
    recordRateLimitHeaders(headers({ "x-month-ratelimit-remaining": "abc", "x-second-ratelimit-remaining": "-3" }), 1);
    expect(getQuota()).toEqual({});
  });
});

describe("health summary", () => {
  it("summarises for the health endpoint without secrets", () => {
    expect(quotaSummary()).toEqual({ monthRemaining: null, monthLimit: null, monthResetsAt: null });
    recordRateLimitHeaders(
      headers({ "x-month-ratelimit-remaining": "1500", "x-month-ratelimit-limit": "50000", "x-month-ratelimit-reset": "10" }),
      0,
    );
    expect(quotaSummary()).toEqual({ monthRemaining: 1500, monthLimit: 50000, monthResetsAt: "1970-01-01T00:00:10.000Z" });
  });
});

describe("per-second pacing", () => {
  it("waits until the reset when no requests remain this second", () => {
    recordRateLimitHeaders(headers({ "x-second-ratelimit-remaining": "0", "x-second-ratelimit-limit": "10", "x-second-ratelimit-reset": "1" }), 1_000);
    expect(secondWaitMs(1_200)).toBe(800);
    expect(secondWaitMs(2_500)).toBe(0);
  });

  it("does not wait while requests remain", () => {
    recordRateLimitHeaders(headers({ "x-second-ratelimit-remaining": "3", "x-second-ratelimit-limit": "10", "x-second-ratelimit-reset": "1" }), 1_000);
    expect(secondWaitMs(1_100)).toBe(0);
  });

  it("caps an implausible reset", () => {
    recordRateLimitHeaders(headers({ "x-second-ratelimit-remaining": "0", "x-second-ratelimit-reset": "9999" }), 0);
    expect(secondWaitMs(0)).toBeLessThanOrEqual(5_000);
  });
});

describe("quota line for qloo:check", () => {
  it("says so when nothing was seen", () => {
    expect(formatQuotaLine(0)).toContain("no rate-limit headers");
  });

  it("prints remaining, limit, days to reset", () => {
    recordRateLimitHeaders(
      headers({ "x-month-ratelimit-remaining": "42900", "x-month-ratelimit-limit": "50000", "x-month-ratelimit-reset": "2548800", "x-second-ratelimit-remaining": "9", "x-second-ratelimit-limit": "10" }),
      0,
    );
    const line = formatQuotaLine(0);
    expect(line).toContain("month 42900/50000 left, resets in 29.5 days");
    expect(line).toContain("second 9/10 left");
  });
});
