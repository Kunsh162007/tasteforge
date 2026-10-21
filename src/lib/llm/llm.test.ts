import { describe, expect, it, vi } from "vitest";
import { loadLlmConfig } from "./config";
import { createGeminiProvider } from "./gemini";
import { createGroqProvider } from "./groq";
import { createLlm } from "./index";
import { createMockLlm } from "./mock";
import { withRetry } from "./retry";
import { LlmError, type JsonRequest } from "./types";

const KEY = "SECRET-KEY-123";
const req: JsonRequest = { system: "sys", prompt: "hi" };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchOf = (fn: (url: string, init: RequestInit) => Response | Promise<Response>) =>
  vi.fn(async (url: string | URL | Request, init?: RequestInit) => fn(String(url), init ?? {})) as unknown as typeof fetch & {
    mock: { calls: [string, RequestInit][] };
  };
const geminiReply = (text: string) => json({ candidates: [{ content: { parts: [{ text }] } }] });
const groqReply = (text: string | null) => json({ choices: [{ message: { content: text } }] });

describe("gemini provider", () => {
  it("builds the request and parses the JSON reply, ignoring thought parts", async () => {
    const fetchImpl = fetchOf(() =>
      json({ candidates: [{ content: { parts: [{ text: "thinking...", thought: true }, { text: '{"a":' }, { text: "1}" }] } }] }),
    );
    const p = createGeminiProvider({ apiKey: KEY, model: "gemini-2.5-flash", fetchImpl });
    expect(await p.chatJson(req)).toEqual({ a: 1 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    const body = JSON.parse(String(init.body));
    expect(body.systemInstruction.parts[0].text).toBe("sys");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(String(init.body)).not.toContain(KEY);
  });

  it("throws invalid_response on an empty candidate list", async () => {
    const p = createGeminiProvider({ apiKey: KEY, model: "m", fetchImpl: fetchOf(() => json({ candidates: [] })) });
    await expect(p.chatJson(req)).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it.each([
    [429, "rate_limit"],
    [503, "server"],
    [401, "auth"],
    [400, "bad_request"],
  ])("maps HTTP %i to %s without leaking the key", async (status, kind) => {
    const p = createGeminiProvider({ apiKey: KEY, model: "m", fetchImpl: fetchOf(() => json({ error: KEY }, status)) });
    const err = (await p.chatJson(req).catch((e: unknown) => e)) as LlmError;
    expect(err).toMatchObject({ kind, status });
    expect(err.message).not.toContain(KEY);
  });

  it("maps network failure, bad JSON and timeout", async () => {
    const down = createGeminiProvider({ apiKey: KEY, model: "m", fetchImpl: fetchOf(() => Promise.reject(new Error(`boom ${KEY}`))) });
    const err = (await down.chatJson(req).catch((e: unknown) => e)) as LlmError;
    expect(err).toMatchObject({ kind: "network" });
    expect(err.message).not.toContain(KEY);
    const bad = createGeminiProvider({ apiKey: KEY, model: "m", fetchImpl: fetchOf(() => new Response("<html>")) });
    await expect(bad.chatJson(req)).rejects.toMatchObject({ kind: "invalid_response" });
    const slow = createGeminiProvider({
      apiKey: KEY,
      model: "m",
      timeoutMs: 10,
      fetchImpl: ((_: string, init: RequestInit) =>
        new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(Object.assign(new Error("a"), { name: "AbortError" }))))) as unknown as typeof fetch,
    });
    await expect(slow.chatJson(req)).rejects.toMatchObject({ kind: "timeout" });
  });
});

describe("groq provider", () => {
  it("sends OpenAI-style messages and parses the JSON reply", async () => {
    const fetchImpl = fetchOf(() => groqReply('{"ok":true}'));
    const p = createGroqProvider({ apiKey: KEY, model: "openai/gpt-oss-120b", fetchImpl });
    expect(await p.chatJson(req)).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(body.messages[1]).toEqual({ role: "user", content: "hi" });
  });

  it("handles missing choices and null content", async () => {
    const p = createGroqProvider({ apiKey: KEY, model: "m", fetchImpl: fetchOf(() => json({ choices: [] })) });
    await expect(p.chatJson(req)).rejects.toMatchObject({ kind: "invalid_response" });
    const q = createGroqProvider({ apiKey: KEY, model: "m", fetchImpl: fetchOf(() => groqReply(null)) });
    await expect(q.chatJson(req)).rejects.toMatchObject({ kind: "invalid_response" });
  });
});

describe("withRetry", () => {
  const sleep = vi.fn(async () => {});

  it("retries retryable errors with exponential backoff then succeeds", async () => {
    let n = 0;
    const out = await withRetry(
      async () => {
        n += 1;
        if (n < 3) throw new LlmError("p", "rate_limit", "x", 429);
        return "ok";
      },
      { retries: 2, baseDelayMs: 100, sleep },
    );
    expect(out).toBe("ok");
    expect(sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([100, 200]);
  });

  it("gives up after the retry budget and never retries auth errors", async () => {
    const always = vi.fn(async () => {
      throw new LlmError("p", "server", "x", 500);
    });
    await expect(withRetry(always, { retries: 1, baseDelayMs: 1, sleep })).rejects.toBeInstanceOf(LlmError);
    expect(always).toHaveBeenCalledTimes(2);
    const auth = vi.fn(async () => {
      throw new LlmError("p", "auth", "x", 401);
    });
    await expect(withRetry(auth, { retries: 3, baseDelayMs: 1, sleep })).rejects.toBeDefined();
    expect(auth).toHaveBeenCalledTimes(1);
    await expect(withRetry(async () => { throw new Error("plain"); }, { retries: 3, baseDelayMs: 1 })).rejects.toThrow("plain");
  });

  it("uses a real timer when no sleep is injected", async () => {
    let n = 0;
    const out = await withRetry(async () => {
      n += 1;
      if (n === 1) throw new LlmError("p", "network", "x");
      return n;
    }, { retries: 1, baseDelayMs: 1 });
    expect(out).toBe(2);
  });
});

describe("config and createLlm", () => {
  const env = { LLM_PROVIDER: "gemini", GEMINI_API_KEY: "g", GROQ_API_KEY: "q" };

  it("loads defaults and validates", () => {
    expect(loadLlmConfig(env)).toMatchObject({ provider: "gemini", geminiModel: "gemini-2.5-flash", groqModel: "openai/gpt-oss-120b" });
    expect(loadLlmConfig(env).chain).toHaveLength(6);
    expect(loadLlmConfig({ GEMINI_API_KEY: "g", GEMINI_MODEL: " m " }).geminiModel).toBe("m");
    expect(() => loadLlmConfig({ LLM_PROVIDER: "openai" })).toThrow(/LLM_PROVIDER/);
    expect(() => loadLlmConfig({})).toThrow(/GEMINI_API_KEY/);
    expect(() => loadLlmConfig({ LLM_PROVIDER: "groq" })).toThrow(/GROQ_API_KEY/);
  });

  it("throws a clear error for hand-built configs with an empty chain", () => {
    expect(() => createLlm({ geminiModel: "m", geminiLightModel: "l", groqModel: "m", groqTokensPerMinute: 8000, groqTokenLimits: {}, provider: "gemini", chain: [], fastChain: [] })).toThrow(/chain/);
  });

  it("counts each logical call once, whatever the retries", async () => {
    const onCall = vi.fn();
    const fetchImpl = fetchOf(() => geminiReply('{"a":1}'));
    const llm = createLlm(loadLlmConfig({ GEMINI_API_KEY: "g" }), { fetchImpl, onCall, cache: false });
    await llm.chatJson(req);
    await llm.chatJson(req);
    expect(onCall).toHaveBeenCalledTimes(2);
  });

});

describe("mock provider", () => {
  it("plays the script in order, supports functions, errors and exhaustion", async () => {
    const mock = createMockLlm([{ a: 1 }, () => ({ b: 2 }), new Error("boom")]);
    expect(await mock.chatJson(req)).toEqual({ a: 1 });
    expect(await mock.chatJson(req)).toEqual({ b: 2 });
    await expect(mock.chatJson(req)).rejects.toThrow("boom");
    await expect(mock.chatJson(req)).rejects.toThrow(/exhausted/);
    expect(mock.jsonRequests).toHaveLength(4);
  });
});
