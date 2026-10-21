import { describe, expect, it } from "vitest";
import { nextUtcMidnight, parseRateLimit } from "./ratelimit";

describe("parseRateLimit", () => {
  it("reads Gemini retryDelay and flags per-day quotas", () => {
    const body = JSON.stringify({
      error: { details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }, { retryDelay: "34s" }] },
    });
    expect(parseRateLimit(undefined, body)).toEqual({ retryAfterMs: 34_000, quota: "day" });
  });

  it("treats a per-minute Gemini quota as minute scope", () => {
    const body = '{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel","retryDelay":"7.5s"}';
    expect(parseRateLimit(undefined, body)).toEqual({ retryAfterMs: 7_500, quota: "minute" });
  });

  it("prefers the retry-after header and understands Groq wording", () => {
    expect(parseRateLimit("12", "")).toEqual({ retryAfterMs: 12_000, quota: "minute" });
    expect(parseRateLimit(undefined, "Rate limit reached on tokens per day (TPD). Please try again in 7m12.5s.")).toEqual({
      retryAfterMs: 432_500,
      quota: "day",
    });
    expect(parseRateLimit(undefined, "Please try again in 850ms")).toEqual({ retryAfterMs: 850, quota: "minute" });
  });

  it("returns nothing for unknown bodies", () => {
    expect(parseRateLimit(undefined, "<html>")).toEqual({ quota: "minute" });
  });
});

describe("nextUtcMidnight", () => {
  it("returns the next 00:00 UTC", () => {
    expect(nextUtcMidnight(Date.parse("2026-11-02T15:30:00Z"))).toBe(Date.parse("2026-11-03T00:00:00Z"));
    expect(nextUtcMidnight(Date.parse("2026-11-02T00:00:00Z"))).toBe(Date.parse("2026-11-03T00:00:00Z"));
  });
});

describe("rate-limit detail for logs", () => {
  it("keeps Groq's numbers and drops organisation and model identifiers", () => {
    const body = JSON.stringify({
      error: { message: "Rate limit reached for model `qwen/qwen3.8-27b` in organization `org_01abcXYZ` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 7100, Requested 5200. Please try again in 3.2s." },
    });
    const info = parseRateLimit("4", body);
    expect(info.detail).toContain("Limit 8000, Used 7100, Requested 5200");
    expect(info.detail).not.toMatch(/org_|qwen/);
    expect(info.retryAfterMs).toBe(4000);
    expect(parseRateLimit(undefined, "not json").detail).toBeUndefined();
  });
});
