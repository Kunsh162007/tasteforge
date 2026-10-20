import { describe, expect, it, vi } from "vitest";
import { loadLlmConfig, parseLlmChain, DEFAULT_LLM_CHAIN } from "./config";
import { createLlm } from "./index";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const ids = (c: ReturnType<typeof loadLlmConfig>) => c.chain.map((e) => `${e.provider}:${e.model}`);

describe("parseLlmChain", () => {
  it("parses provider:model pairs, keeping slashes in model ids", () => {
    expect(parseLlmChain("gemini:gemini-3.5-flash, groq:openai/gpt-oss-120b")).toEqual([
      { provider: "gemini", model: "gemini-3.5-flash" },
      { provider: "groq", model: "openai/gpt-oss-120b" },
    ]);
  });

  it("rejects malformed entries", () => {
    expect(() => parseLlmChain("gemini")).toThrow(/LLM_CHAIN/);
    expect(() => parseLlmChain("openai:gpt-5")).toThrow(/LLM_CHAIN/);
  });
});

describe("chain config", () => {
  const keys = { GEMINI_API_KEY: "g", GROQ_API_KEY: "q" };

  it("defaults to the documented cascade", () => {
    expect(ids(loadLlmConfig(keys))).toEqual([
      "gemini:gemini-3.5-flash-lite",
      "gemini:gemini-3.5-flash",
      "gemini:gemini-2.5-flash",
      "groq:openai/gpt-oss-120b",
      "groq:qwen/qwen3.8-27b",
    ]);
    expect(DEFAULT_LLM_CHAIN).toContain("groq:qwen/qwen3.8-27b");
  });

  it("uses LLM_CHAIN when set and drops entries whose provider has no key", () => {
    expect(ids(loadLlmConfig({ ...keys, LLM_CHAIN: "groq:a,gemini:b" }))).toEqual(["groq:a", "gemini:b"]);
    expect(ids(loadLlmConfig({ GEMINI_API_KEY: "g", LLM_CHAIN: "groq:a,gemini:b" }))).toEqual(["gemini:b"]);
  });

  it("keeps the legacy variables working: GEMINI_MODEL first, LLM_PROVIDER=groq puts Groq first", () => {
    expect(ids(loadLlmConfig({ ...keys, GEMINI_MODEL: "gemini-x" }))[0]).toBe("gemini:gemini-x");
    expect(ids(loadLlmConfig({ ...keys, GEMINI_MODEL: "gemini-3.5-flash-lite" })).filter((i) => i.includes("flash-lite"))).toHaveLength(1);
    expect(ids(loadLlmConfig({ ...keys, LLM_PROVIDER: "groq", GROQ_MODEL: "m" }))[0]).toBe("groq:m");
    const mixed = ids(loadLlmConfig({ ...keys, GROQ_MODEL: "openai/gpt-oss-20b" }));
    expect(mixed.indexOf("groq:openai/gpt-oss-20b")).toBeGreaterThan(mixed.indexOf("gemini:gemini-2.5-flash"));
  });

  it("requires a key for at least one chain entry", () => {
    expect(() => loadLlmConfig({})).toThrow(/GEMINI_API_KEY/);
    expect(() => loadLlmConfig({ LLM_PROVIDER: "groq" })).toThrow(/GROQ_API_KEY/);
    expect(loadLlmConfig({ LLM_PROVIDER: "mock" }).chain).toEqual([]);
  });
});

describe("createLlm cascade", () => {
  it("cools an exhausted Gemini model for the day and answers from the next, reporting its id", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      urls.push(u);
      if (u.includes("gemini-3.5-flash-lite")) {
        return json({ error: { details: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] } }, 429);
      }
      return json({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
    }) as unknown as typeof fetch;
    const llm = createLlm(loadLlmConfig({ GEMINI_API_KEY: "g" }), { fetchImpl, cache: false });
    expect(await llm.chatJson({ system: "s", prompt: "a" })).toEqual({ ok: true });
    expect(llm.name).toBe("gemini:gemini-3.5-flash");
    await llm.chatJson({ system: "s", prompt: "b" });
    expect(urls.filter((u) => u.includes("flash-lite"))).toHaveLength(1);
  });

  it("sends Groq requests when the chain reaches Groq", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("groq") ? json({ choices: [{ message: { content: '{"g":1}' } }] }) : json({}, 503),
    ) as unknown as typeof fetch;
    const llm = createLlm(loadLlmConfig({ GEMINI_API_KEY: "g", GROQ_API_KEY: "q" }), { fetchImpl, cache: false });
    expect(await llm.chatJson({ system: "s", prompt: "a" })).toEqual({ g: 1 });
    expect(llm.name).toBe("groq:openai/gpt-oss-120b");
  });
});
