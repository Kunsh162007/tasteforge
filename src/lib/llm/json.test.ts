import { describe, expect, it, vi } from "vitest";
import { jsonRequestKey, withJsonCache } from "./cache";
import { loadLlmConfig } from "./config";
import { createGeminiProvider } from "./gemini";
import { createGroqProvider } from "./groq";
import { createLlm } from "./index";
import { parseJsonText } from "./json";
import { createMockLlm } from "./mock";
import { LlmError, type JsonRequest } from "./types";

const KEY = "SECRET-KEY-123";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchOf = (fn: (url: string, init: RequestInit) => Response) =>
  vi.fn(async (url: string | URL | Request, init?: RequestInit) => fn(String(url), init ?? {})) as unknown as typeof fetch & {
    mock: { calls: [string, RequestInit][] };
  };
const geminiReply = (text: string) => json({ candidates: [{ content: { parts: [{ text }] } }] });
const groqReply = (content: string) => json({ choices: [{ message: { content } }] });
const schema = { type: "object", properties: { a: { type: "string" } } };
const req: JsonRequest = { system: "sys", prompt: "go", schema, tier: "light" };

describe("parseJsonText", () => {
  it("parses plain and fenced JSON", () => {
    expect(parseJsonText("p", '{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonText("p", '```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });
  it("throws invalid_response for empty or broken text", () => {
    expect(() => parseJsonText("p", "  ")).toThrow(LlmError);
    expect(() => parseJsonText("p", "{nope")).toThrowError(/could not be parsed/);
    expect(() => parseJsonText("p", undefined)).toThrow(/empty/);
  });
});

describe("gemini chatJson", () => {
  it("uses JSON mime type, response schema and the light model", async () => {
    const fetchImpl = fetchOf(() => geminiReply('{"a":"x"}'));
    const p = createGeminiProvider({ apiKey: KEY, model: "main-m", lightModel: "light-m", fetchImpl });
    await expect(p.chatJson(req)).resolves.toEqual({ a: "x" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/light-m:generateContent");
    const body = JSON.parse(String(init.body));
    expect(body.generationConfig).toMatchObject({
      responseMimeType: "application/json",
      responseJsonSchema: schema,
      thinkingConfig: { thinkingBudget: 0 },
    });
    expect(body.tools).toBeUndefined();
    expect(String(init.body)).not.toContain(KEY);
  });

  it("uses the main model by default, omits an absent schema and falls back to model when no light model", async () => {
    const fetchImpl = fetchOf(() => geminiReply("{}"));
    const p = createGeminiProvider({ apiKey: KEY, model: "main-m", fetchImpl });
    await p.chatJson({ system: "s", prompt: "p" });
    await p.chatJson({ system: "s", prompt: "p", tier: "light" });
    expect(fetchImpl.mock.calls[0][0]).toContain("/main-m:");
    expect(fetchImpl.mock.calls[1][0]).toContain("/main-m:");
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1].body)).generationConfig.responseJsonSchema).toBeUndefined();
  });

  it("falls back to the main model when the light model is gone (404) but not on other errors", async () => {
    const fetchImpl = fetchOf((url) => (url.includes("/light-m:") ? json({}, 404) : geminiReply('{"a":"z"}')));
    const p = createGeminiProvider({ apiKey: KEY, model: "main-m", lightModel: "light-m", fetchImpl });
    await expect(p.chatJson(req)).resolves.toEqual({ a: "z" });
    expect(fetchImpl.mock.calls).toHaveLength(2);
    const bad = createGeminiProvider({ apiKey: KEY, model: "main-m", lightModel: "light-m", fetchImpl: fetchOf(() => json({}, 429)) });
    await expect(bad.chatJson(req)).rejects.toMatchObject({ kind: "rate_limit" });
    const same = createGeminiProvider({ apiKey: KEY, model: "main-m", fetchImpl: fetchOf(() => json({}, 404)) });
    await expect(same.chatJson(req)).rejects.toMatchObject({ status: 404 });
  });

  it("raises invalid_response on unparsable text", async () => {
    const p = createGeminiProvider({ apiKey: KEY, model: "m", fetchImpl: fetchOf(() => geminiReply("not json")) });
    await expect(p.chatJson(req)).rejects.toMatchObject({ kind: "invalid_response" });
  });
});

describe("groq chatJson", () => {
  it("requests json_object and embeds the schema in the system message", async () => {
    const fetchImpl = fetchOf(() => groqReply('{"a":"y"}'));
    const p = createGroqProvider({ apiKey: KEY, model: "gpt-oss", fetchImpl });
    await expect(p.chatJson(req)).resolves.toEqual({ a: "y" });
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].content).toContain('"properties"');
    expect(body.messages[1]).toEqual({ role: "user", content: "go" });
    expect(body.tools).toBeUndefined();
  });

  it("omits the schema text when none is given", async () => {
    const fetchImpl = fetchOf(() => groqReply("{}"));
    const p = createGroqProvider({ apiKey: KEY, model: "m", fetchImpl });
    await p.chatJson({ system: "only", prompt: "p" });
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1].body)).messages[0].content).toBe("only");
  });
});

describe("withJsonCache", () => {
  it("serves repeated requests from cache and keys on tier and prompt", async () => {
    const inner = createMockLlm([{ n: 1 }, { n: 2 }, { n: 3 }], "m");
    const llm = withJsonCache(inner);
    expect(await llm.chatJson(req)).toEqual({ n: 1 });
    expect(await llm.chatJson(req)).toEqual({ n: 1 });
    expect(await llm.chatJson({ ...req, tier: "main" })).toEqual({ n: 2 });
    expect(await llm.chatJson({ ...req, prompt: "other" })).toEqual({ n: 3 });
    expect(inner.jsonRequests).toHaveLength(3);
    expect(llm.name).toBe("m");
    expect(jsonRequestKey(req)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not cache failures and shares in-flight identical calls", async () => {
    const inner = createMockLlm([new Error("boom"), { ok: true }], "m");
    const llm = withJsonCache(inner);
    await expect(llm.chatJson(req)).rejects.toThrow("boom");
    const [a, b] = await Promise.all([llm.chatJson(req), llm.chatJson(req)]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(inner.jsonRequests).toHaveLength(2);
  });

});

describe("createLlm JSON mode", () => {
  const config = loadLlmConfig({ GEMINI_API_KEY: KEY, GROQ_API_KEY: "g-key" });

  it("defaults the light model and reads GEMINI_LIGHT_MODEL", () => {
    expect(config.geminiLightModel).toBe("gemini-3.5-flash-lite");
    expect(loadLlmConfig({ GEMINI_API_KEY: KEY, GEMINI_LIGHT_MODEL: "x" }).geminiLightModel).toBe("x");
  });

  it("can disable the cache and builds a Groq-only provider", async () => {
    const fetchImpl = fetchOf(() => groqReply("{}"));
    const llm = createLlm(loadLlmConfig({ LLM_PROVIDER: "groq", GROQ_API_KEY: "g" }), { fetchImpl, cache: false });
    await llm.chatJson(req);
    await llm.chatJson(req);
    expect(fetchImpl.mock.calls).toHaveLength(2);
  });
});

describe("mock chatJson", () => {
  it("supports functions and exhaustion", async () => {
    const llm = createMockLlm([(r: JsonRequest) => ({ echo: r.prompt })], "m");
    expect(await llm.chatJson(req)).toEqual({ echo: "go" });
    await expect(llm.chatJson(req)).rejects.toThrow(/exhausted/);
  });
});
