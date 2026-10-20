import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../rateLimit";
import { parseBriefRequest, toSseFrame } from "./request";

describe("parseBriefRequest", () => {
  it("accepts and trims valid input", () => {
    const r = parseBriefRequest({ prompt: "  indie cafe in Brooklyn ", mode: "know_audience", city: " Brooklyn " });
    expect(r).toEqual({ ok: true, value: { prompt: "indie cafe in Brooklyn", mode: "know_audience", city: "Brooklyn" } });
  });

  it("omits an empty city", () => {
    const r = parseBriefRequest({ prompt: "abc def", mode: "find_audience", city: "" });
    expect(r).toEqual({ ok: true, value: { prompt: "abc def", mode: "find_audience" } });
  });

  it.each([
    [{ prompt: "x".repeat(1001), mode: "know_audience" }, /prompt/],
    [{ prompt: "ok ok", mode: "other" }, /mode/],
    [{ prompt: "ok ok", mode: "know_audience", city: "c".repeat(81) }, /city/],
    ["nope", /Invalid|prompt/],
  ])("rejects %#", (body, message) => {
    const r = parseBriefRequest(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(message);
  });
});

describe("parseBriefRequest selections", () => {
  const base = { prompt: "ok ok", mode: "know_audience" };

  it("accepts Qloo ids and option objects", () => {
    const id = "B7F7C2F9-4795-43E5-B1F4-4E8DB9B4A9B1";
    const r = parseBriefRequest({ ...base, selections: [id, { qlooId: "MOCK-ARTIST-1", label: "x", kind: "artist" }] });
    expect(r).toMatchObject({ ok: true, value: { selections: [id, "MOCK-ARTIST-1"] } });
  });

  it.each([["a,b"], ["not an id"], ["urn:tag:genre,media"], ["x".repeat(130)]])("rejects the malformed selection %j", (bad) => {
    const r = parseBriefRequest({ ...base, selections: [bad] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/selections/);
  });
});

describe("toSseFrame", () => {
  it("formats event and data lines", () => {
    expect(toSseFrame({ type: "done", ok: true })).toBe('event: done\ndata: {"type":"done","ok":true}\n\n');
  });
});

describe("createRateLimiter", () => {
  it("blocks after the limit and recovers when the window passes", () => {
    let t = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    const blocked = limiter.check("a");
    expect(blocked).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(limiter.check("b").allowed).toBe(true);
    t = 1001;
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("prunes expired keys when the table grows large", () => {
    let t = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 10, now: () => t });
    for (let i = 0; i < 5001; i += 1) limiter.check(`k${i}`);
    t = 100;
    expect(limiter.check("k0").allowed).toBe(true);
    expect(limiter.check("fresh").allowed).toBe(true);
  });
});

describe("selections", () => {
  const base = { prompt: "dream pop fans", mode: "know_audience" as const };

  it("accepts option objects or plain ids and normalizes to ids", () => {
    const r = parseBriefRequest({ ...base, selections: [{ label: "Paris (place)", qlooId: "MOCK-PLACE-1", kind: "place" }, "MOCK-MAIN-1"] });
    expect(r).toEqual({ ok: true, value: { ...base, selections: ["MOCK-PLACE-1", "MOCK-MAIN-1"] } });
  });

  it("omits empty selections and rejects oversized or malformed ones", () => {
    expect(parseBriefRequest({ ...base, selections: [] })).toEqual({ ok: true, value: base });
    const many = Array.from({ length: 11 }, (_, i) => `MOCK-ARTIST-${i}`);
    expect(parseBriefRequest({ ...base, selections: many })).toMatchObject({ ok: false, message: expect.stringMatching(/selections/) });
    expect(parseBriefRequest({ ...base, selections: [{ nope: 1 }] }).ok).toBe(false);
  });
});
