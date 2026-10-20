import { describe, expect, it, vi } from "vitest";
import { createCascade, cooldownUntil } from "./cascade";
import { LlmError, type JsonRequest, type LlmProvider } from "./types";

const req: JsonRequest = { system: "s", prompt: "p" };
const T0 = Date.parse("2026-11-02T10:00:00Z");

function stub(replies: (unknown | Error)[]): LlmProvider & { calls: number } {
  let i = 0;
  const p = {
    name: "stub",
    calls: 0,
    async chatJson() {
      p.calls += 1;
      const r = replies[Math.min(i++, replies.length - 1)];
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return p;
}

const rate = (retryAfterMs?: number, quota: "day" | "minute" = "minute") =>
  new LlmError("gemini", "rate_limit", "429", 429, { retryAfterMs, quota });

describe("cooldownUntil", () => {
  it("cools daily quotas until UTC midnight, minute quotas for retry-after, server errors briefly", () => {
    expect(cooldownUntil(rate(undefined, "day"), T0)).toBe(Date.parse("2026-11-03T00:00:00Z"));
    expect(cooldownUntil(rate(20_000), T0)).toBe(T0 + 20_000);
    expect(cooldownUntil(rate(), T0)).toBeGreaterThan(T0);
    expect(cooldownUntil(new LlmError("g", "server", "503", 503), T0)).toBeGreaterThan(T0);
    expect(cooldownUntil(new LlmError("g", "invalid_response", "bad"), T0)).toBeUndefined();
    expect(cooldownUntil(new LlmError("g", "bad_request", "413", 413), T0)).toBeUndefined();
    expect(cooldownUntil(new LlmError("g", "bad_request", "404", 404), T0)).toBeGreaterThan(T0);
  });
});

describe("createCascade", () => {
  it("moves to the next model on 429 and skips the cooled one afterwards", async () => {
    const a = stub([rate(60_000)]);
    const b = stub([{ from: "b" }]);
    let now = T0;
    const onSwitch = vi.fn();
    const llm = createCascade([{ id: "gemini:a", provider: a }, { id: "gemini:b", provider: b }], { now: () => now, onSwitch });
    expect(llm.name).toBe("gemini:a");
    expect(await llm.chatJson(req)).toEqual({ from: "b" });
    expect(llm.name).toBe("gemini:b");
    expect(onSwitch).toHaveBeenCalledWith("gemini:a", "gemini:b", expect.any(LlmError));
    await llm.chatJson(req);
    expect(a.calls).toBe(1);
    now += 61_000;
    await llm.chatJson(req);
    expect(a.calls).toBe(2);
  });

  it("keeps a daily-exhausted model out until UTC midnight", async () => {
    const a = stub([rate(undefined, "day"), { ok: "a" }]);
    const b = stub([{ ok: "b" }]);
    let now = T0;
    const llm = createCascade([{ id: "a", provider: a }, { id: "b", provider: b }], { now: () => now });
    await llm.chatJson(req);
    now = Date.parse("2026-11-02T23:59:00Z");
    expect(await llm.chatJson(req)).toEqual({ ok: "b" });
    expect(a.calls).toBe(1);
    now = Date.parse("2026-11-03T00:00:01Z");
    expect(await llm.chatJson(req)).toEqual({ ok: "a" });
  });

  it("falls through unparsable replies without cooling the model", async () => {
    const a = stub([new LlmError("g", "invalid_response", "junk"), { ok: "a" }]);
    const b = stub([{ ok: "b" }]);
    const llm = createCascade([{ id: "a", provider: a }, { id: "b", provider: b }], { now: () => T0 });
    expect(await llm.chatJson(req)).toEqual({ ok: "b" });
    expect(await llm.chatJson(req)).toEqual({ ok: "a" });
  });

  it("fails with a rate_limit error when every model is cooling or failing", async () => {
    const a = stub([rate(30_000)]);
    const b = stub([new LlmError("groq", "server", "503", 503)]);
    const llm = createCascade([{ id: "a", provider: a }, { id: "b", provider: b }], { now: () => T0 });
    await expect(llm.chatJson(req)).rejects.toMatchObject({ kind: "server" });
    await expect(llm.chatJson(req)).rejects.toMatchObject({ kind: "rate_limit" });
    expect(a.calls).toBe(1);
    expect(b.calls).toBe(1);
  });

  it("rethrows non-LLM errors and counts each upstream attempt", async () => {
    const boom = stub([new Error("bug")]);
    await expect(createCascade([{ id: "a", provider: boom }]).chatJson(req)).rejects.toThrow("bug");
    const onCall = vi.fn();
    const llm = createCascade([{ id: "a", provider: stub([rate(1000)]) }, { id: "b", provider: stub([{}]) }], { now: () => T0, onCall });
    await llm.chatJson(req);
    expect(onCall).toHaveBeenCalledTimes(2);
  });
});
