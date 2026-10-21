import { describe, expect, it, vi } from "vitest";
import { createCascade, estimateTokens } from "./cascade";
import { parseTokenLimits } from "./config";
import { createGroqProvider, rateLimitObservation, usedTokens } from "./groq";
import { createTokenBudget } from "./tokenBudget";
import { LlmError, type JsonRequest, type LlmProvider } from "./types";

const A = "groq:a";
const B = "groq:b";

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

const make = (c = clock(), limits: Record<string, number> = { [A]: 8000, [B]: 8000 }) => ({ c, budget: createTokenBudget({ now: c.now, limits, tracks: (id) => id.startsWith("groq:") }) });

describe("createTokenBudget", () => {
  it("treats untracked models as unlimited", () => {
    const { budget } = make();
    expect(budget.headroom("gemini:x")).toBe(Number.POSITIVE_INFINITY);
    expect(budget.fits("gemini:x", 1e9)).toBe(true);
    expect(budget.waitFor("gemini:x", 1e9)).toBe(0);
  });

  it("counts reserved and settled tokens within the minute and frees them after it", () => {
    const { c, budget } = make();
    budget.reserve(A, 5000).settle(4800);
    expect(budget.headroom(A)).toBe(3200);
    expect(budget.fits(A, 2000)).toBe(true);
    expect(budget.fits(A, 3000)).toBe(false); // would leave under the 10% margin
    c.advance(61_000);
    expect(budget.headroom(A)).toBe(8000);
  });

  it("counts an in-flight reservation straight away, and releases it when the request fails", () => {
    const { budget } = make();
    const hold = budget.reserve(A, 6000);
    expect(budget.fits(A, 3000)).toBe(false);
    hold.settle(0);
    expect(budget.fits(A, 3000)).toBe(true);
  });

  it("tells how long until a request would fit", () => {
    const { c, budget } = make();
    budget.reserve(A, 7000).settle(7000);
    c.advance(20_000);
    const wait = budget.waitFor(A, 3000);
    expect(wait).toBeGreaterThan(39_000);
    expect(wait).toBeLessThanOrEqual(40_001);
    expect(budget.waitFor(A, 9000)).toBe(Number.POSITIVE_INFINITY);
  });

  it("trusts the provider's remaining-tokens header over the estimate, and learns the limit", () => {
    const { budget } = make();
    budget.reserve(A, 1000).settle(1000);
    budget.observe(A, { remainingTokens: 500, limitTokens: 6000 });
    expect(budget.limit(A)).toBe(6000);
    expect(budget.headroom(A)).toBe(500);
    expect(budget.fits(A, 1000)).toBe(false);
  });

  it("refills the header-based count linearly", () => {
    const { c, budget } = make({ ...clock() }, { [A]: 6000 });
    budget.observe(A, { remainingTokens: 0 });
    c.advance(30_000);
    expect(budget.headroom(A)).toBe(3000);
  });

  it("settles the oldest in-flight request from the reply's own token count", () => {
    const { budget } = make();
    budget.reserve(A, 5000);
    budget.observe(A, { tokens: 1200 });
    expect(budget.headroom(A)).toBe(6800);
  });
});

describe("parseTokenLimits and Groq usage", () => {
  it("caps the reply per route, so Groq's up-front check sees a request that fits the minute", async () => {
    const bodies: { max_completion_tokens?: number }[] = [];
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
    }) as typeof fetch;
    const llm = createGroqProvider({ apiKey: "k", model: "m", fetchImpl });
    await llm.chatJson({ system: "s", prompt: "p", route: "main" });
    await llm.chatJson({ system: "s", prompt: "p", tier: "light" });
    expect(bodies.map((b) => b.max_completion_tokens)).toEqual([3000, 800]);
  });

  it("parses model=tokens lists and ignores junk", () => {
    expect(parseTokenLimits("openai/gpt-oss-120b=8000, qwen/qwen3.8-27b=6000,bad,x=-1")).toEqual({ "openai/gpt-oss-120b": 8000, "qwen/qwen3.8-27b": 6000 });
    expect(parseTokenLimits(undefined)).toEqual({});
  });

  it("reads Groq's rate-limit headers and usage field", () => {
    const h = new Headers({ "x-ratelimit-remaining-tokens": "7312", "x-ratelimit-limit-tokens": "8000" });
    expect(rateLimitObservation(h)).toEqual({ remainingTokens: 7312, limitTokens: 8000 });
    expect(rateLimitObservation(new Headers())).toEqual({});
    expect(usedTokens({ usage: { total_tokens: 4321 } })).toBe(4321);
    expect(usedTokens({})).toBeUndefined();
  });

  it("reports headers and usage from a real reply, including a 429", async () => {
    const onUsage = vi.fn();
    const ok = new Response(JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }], usage: { total_tokens: 900 } }), {
      status: 200,
      headers: { "x-ratelimit-remaining-tokens": "7100", "content-type": "application/json" },
    });
    const limited = new Response("{}", { status: 429, headers: { "x-ratelimit-remaining-tokens": "0", "retry-after": "12" } });
    const replies = [ok, limited];
    const llm = createGroqProvider({ apiKey: "k", model: "m", onUsage, fetchImpl: (async () => replies.shift() as Response) as typeof fetch });
    expect(await llm.chatJson({ system: "s", prompt: "p" })).toEqual({ a: 1 });
    expect(onUsage).toHaveBeenCalledWith({ remainingTokens: 7100 });
    expect(onUsage).toHaveBeenCalledWith({ tokens: 900 });
    await expect(llm.chatJson({ system: "s", prompt: "p" })).rejects.toMatchObject({ kind: "rate_limit", retryAfterMs: 12_000 });
    expect(onUsage).toHaveBeenCalledWith({ remainingTokens: 0 });
  });
});

function answering(name: string): LlmProvider & { calls: number } {
  const p = {
    name,
    calls: 0,
    async chatJson() {
      p.calls += 1;
      return { from: name };
    },
  };
  return p;
}

const small: JsonRequest = { system: "s", prompt: "p".repeat(300), route: "fast" };

describe("cascade with a token budget", () => {
  it("passes over a model that has no room and uses the next one", async () => {
    const { budget } = make();
    const a = answering("a");
    const b = answering("b");
    budget.observe(A, { remainingTokens: 200 });
    const llm = createCascade([{ id: A, provider: a }, { id: B, provider: b }], { budget });
    expect(await llm.chatJson(small)).toEqual({ from: "b" });
    expect(a.calls).toBe(0);
  });

  it("spreads concurrent requests: the first reservation pushes the second to the other model", async () => {
    const { budget } = make();
    const a = answering("a");
    const b = answering("b");
    const llm = createCascade([{ id: A, provider: a }, { id: B, provider: b }], { budget });
    const big: JsonRequest = { system: "s", prompt: "p".repeat(8_000), route: "main" }; // ~2400 + a 3000-token reply: more than half a minute's budget
    const results = await Promise.all([llm.chatJson(big), llm.chatJson(big)]);
    expect(results).toEqual([{ from: "a" }, { from: "b" }]);
  });

  it("still tries models in chain order when there is room everywhere", async () => {
    const { budget } = make();
    const a = answering("a");
    const llm = createCascade([{ id: A, provider: a }, { id: B, provider: answering("b") }], { budget });
    await llm.chatJson(small);
    expect(a.calls).toBe(1);
  });

  it("queues when every model is out of tokens, tells the caller, and answers after the wait", async () => {
    const { c, budget } = make();
    budget.reserve(A, 7800).settle(7800);
    budget.reserve(B, 7800).settle(7800);
    c.advance(40_000); // 20 s until the first of them leaves the minute
    const a = answering("a");
    const onWait = vi.fn();
    const sleep = vi.fn(async (ms: number) => void c.advance(ms));
    const llm = createCascade([{ id: A, provider: a }, { id: B, provider: answering("b") }], { budget, now: c.now, sleep });
    expect(await llm.chatJson({ ...small, onWait })).toEqual({ from: "a" });
    expect(onWait).toHaveBeenCalledWith({ waitMs: expect.any(Number) });
    expect(onWait.mock.calls[0][0].waitMs).toBeGreaterThan(0);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("queues when every model is cooling down for a short while", async () => {
    const c = clock();
    const hit = new LlmError("groq", "rate_limit", "429", 429, { retryAfterMs: 8_000 });
    let first = true;
    const flaky: LlmProvider = {
      name: "f",
      async chatJson() {
        if (first) {
          first = false;
          throw hit;
        }
        return { ok: true };
      },
    };
    const onWait = vi.fn();
    const sleep = vi.fn(async (ms: number) => void c.advance(ms));
    const llm = createCascade([{ id: A, provider: flaky }], { now: c.now, sleep, cooldowns: new Map() });
    expect(await llm.chatJson({ ...small, onWait })).toEqual({ ok: true });
    expect(onWait.mock.calls[0][0].waitMs).toBeGreaterThanOrEqual(5_000);
  });

  it("does not queue past the caller's deadline or the longest allowed wait", async () => {
    const { c, budget } = make();
    budget.reserve(A, 7800).settle(7800);
    const sleep = vi.fn();
    const onWait = vi.fn();
    const llm = createCascade([{ id: A, provider: answering("a") }], { budget, now: c.now, sleep });
    // The deadline leaves too little time after the wait: try the model anyway, no queueing.
    await llm.chatJson({ ...small, onWait, deadlineAt: c.now() + 15_000 });
    expect(sleep).not.toHaveBeenCalled();
    expect(onWait).not.toHaveBeenCalled();
  });

  it("tells the caller which model answered its own request", async () => {
    const { budget } = make();
    const onAnswered = vi.fn();
    const llm = createCascade([{ id: A, provider: answering("a") }, { id: B, provider: answering("b") }], { budget });
    budget.observe(A, { remainingTokens: 100 });
    await llm.chatJson({ ...small, onAnswered });
    expect(onAnswered).toHaveBeenCalledWith(B);
  });

  it("estimates a request from its text, schema and a typical reply", () => {
    const base = estimateTokens({ system: "x".repeat(3300), prompt: "", route: "fast" });
    expect(base).toBe(1000 + 800);
    expect(estimateTokens({ system: "x".repeat(3300), prompt: "", route: "main" })).toBe(1000 + 3000);
  });
});
