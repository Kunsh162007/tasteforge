import { describe, expect, it, vi } from "vitest";
import { loadLlmConfig } from "./config";
import { forcedQueueSeconds, withSimulatedQueue } from "./forceQueue";
import { createLlm } from "./index";
import type { JsonRequest } from "./types";

describe("forcedQueueSeconds", () => {
  it("is off unless a positive number is set", () => {
    expect(forcedQueueSeconds({})).toBeUndefined();
    expect(forcedQueueSeconds({ LLM_FORCE_QUEUE_SECONDS: "abc" })).toBeUndefined();
    expect(forcedQueueSeconds({ LLM_FORCE_QUEUE_SECONDS: "0" })).toBeUndefined();
    expect(forcedQueueSeconds({ LLM_FORCE_QUEUE_SECONDS: "8" })).toBe(8);
  });

  it("is ignored in production unless explicitly allowed, and capped so a run still fits its deadline", () => {
    expect(forcedQueueSeconds({ LLM_FORCE_QUEUE_SECONDS: "8", NODE_ENV: "production" })).toBeUndefined();
    expect(forcedQueueSeconds({ LLM_FORCE_QUEUE_SECONDS: "8", NODE_ENV: "production", LLM_ALLOW_FORCED_QUEUE: "1" })).toBe(8);
    expect(forcedQueueSeconds({ LLM_FORCE_QUEUE_SECONDS: "500" })).toBe(20);
  });
});

describe("withSimulatedQueue", () => {
  const fast: JsonRequest = { system: "s", prompt: "p", tier: "light" };
  const main: JsonRequest = { system: "s", prompt: "p", tier: "main" };

  it("reports a wait and sleeps before the first fast call, then leaves later calls alone", async () => {
    const sleep = vi.fn(async () => undefined);
    const onWait = vi.fn();
    const llm = withSimulatedQueue({ name: "mock", chatJson: async () => ({ ok: 1 }) }, 6, { sleep, now: () => 1_000_000 });
    expect(await llm.chatJson({ ...fast, onWait })).toEqual({ ok: 1 });
    expect(onWait).toHaveBeenCalledWith({ waitMs: 6000 });
    expect(sleep).toHaveBeenCalledWith(6000);
    await llm.chatJson({ ...fast, onWait });
    expect(onWait).toHaveBeenCalledTimes(1);
  });

  it("does not delay the main chain", async () => {
    const sleep = vi.fn(async () => undefined);
    const llm = withSimulatedQueue({ name: "mock", chatJson: async () => ({}) }, 6, { sleep });
    await llm.chatJson(main);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("createLlm with a forced queue", () => {
  const config = loadLlmConfig({ GROQ_API_KEY: "k", LLM_PROVIDER: "groq" });
  const reply = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });

  it("cools every fast model for the configured time, so the real cascade queues and tells the caller", async () => {
    let clock = 5_000_000;
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    const onWait = vi.fn();
    const llm = createLlm(config, { fetchImpl: (async () => reply()) as unknown as typeof fetch, cache: false, forceQueueSeconds: 7, now: () => clock, sleep });
    const value = await llm.chatJson({ system: "s", prompt: "p", tier: "light", onWait });
    expect(value).toEqual({ ok: true });
    expect(onWait).toHaveBeenCalledTimes(1);
    expect(onWait.mock.calls[0][0].waitMs).toBeGreaterThanOrEqual(6_900);
    expect(onWait.mock.calls[0][0].waitMs).toBeLessThanOrEqual(7_000);
    expect(sleep).toHaveBeenCalled();
  });

  it("does nothing without the setting", async () => {
    const onWait = vi.fn();
    const llm = createLlm(config, { fetchImpl: (async () => reply()) as unknown as typeof fetch, cache: false, forceQueueSeconds: undefined, sleep: async () => undefined });
    await llm.chatJson({ system: "s", prompt: "p", tier: "light", onWait });
    expect(onWait).not.toHaveBeenCalled();
  });
});
