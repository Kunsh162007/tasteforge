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
