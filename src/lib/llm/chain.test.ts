import { describe, expect, it, vi } from "vitest";
import { loadLlmConfig, parseLlmChain, DEFAULT_LLM_CHAIN, DEFAULT_LLM_CHAIN_FAST } from "./config";
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

  it("defaults to the measured cascades: Groq first for both call types, Gemini as the deeper fallback", () => {
    expect(ids(loadLlmConfig(keys))).toEqual([
      "groq:openai/gpt-oss-120b",
      "groq:qwen/qwen3.8-27b",
      "gemini:gemini-2.5-flash",
      "gemini:gemini-3.5-flash",
      "gemini:gemini-3.5-flash-lite",
      "groq:openai/gpt-oss-20b",
    ]);
    expect(DEFAULT_LLM_CHAIN).toContain("groq:qwen/qwen3.8-27b");
    const fast = loadLlmConfig(keys).fastChain.map((e) => `${e.provider}:${e.model}`);
    // The cheap calls start on the small, fast models; the big one is kept for the synthesis.
    expect(fast.slice(0, 3)).toEqual(["groq:openai/gpt-oss-20b", "groq:qwen/qwen3.8-27b", "groq:openai/gpt-oss-120b"]);
    expect(fast).toHaveLength(DEFAULT_LLM_CHAIN_FAST.split(",").length);
    expect(loadLlmConfig(keys).chain[0]).toMatchObject({ model: "openai/gpt-oss-120b" });
    expect(loadLlmConfig(keys)).toMatchObject({ groqTokensPerMinute: 8000, groqTokenLimits: {} });
    expect(loadLlmConfig({ ...keys, GROQ_TOKENS_PER_MINUTE: "6000", GROQ_TOKEN_LIMITS: "qwen/qwen3.8-27b=5000" })).toMatchObject({
      groqTokensPerMinute: 6000,
      groqTokenLimits: { "qwen/qwen3.8-27b": 5000 },
    });
  });

  it("LLM_CHAIN_FAST and LLM_CHAIN_MAIN override their own route; LLM_CHAIN covers a route without its own", () => {
    const c = loadLlmConfig({ ...keys, LLM_CHAIN_FAST: "gemini:f", LLM_CHAIN_MAIN: "groq:m" });
    expect(c.fastChain.map((e) => e.model)).toEqual(["f"]);
    expect(c.chain.map((e) => e.model)).toEqual(["m"]);
    const shared = loadLlmConfig({ ...keys, LLM_CHAIN: "gemini:x", LLM_CHAIN_FAST: "groq:f" });
    expect(shared.fastChain.map((e) => e.model)).toEqual(["f"]);
    expect(shared.chain.map((e) => e.model)).toEqual(["x"]);
  });

  it("uses LLM_CHAIN when set and drops entries whose provider has no key", () => {
    expect(ids(loadLlmConfig({ ...keys, LLM_CHAIN: "groq:a,gemini:b" }))).toEqual(["groq:a", "gemini:b"]);
    expect(ids(loadLlmConfig({ GEMINI_API_KEY: "g", LLM_CHAIN: "groq:a,gemini:b" }))).toEqual(["gemini:b"]);
  });

  it("keeps the legacy variables working: each leads its own provider's group, LLM_PROVIDER=groq puts Groq first", () => {
    const gem = ids(loadLlmConfig({ ...keys, GEMINI_MODEL: "gemini-x" }));
    expect(gem.indexOf("gemini:gemini-x")).toBe(gem.findIndex((i) => i.startsWith("gemini:")));
    expect(gem[0]).toBe("groq:openai/gpt-oss-120b");
    expect(ids(loadLlmConfig({ ...keys, GEMINI_MODEL: "gemini-3.5-flash-lite" })).filter((i) => i.includes("flash-lite"))).toHaveLength(1);
    expect(ids(loadLlmConfig({ ...keys, LLM_PROVIDER: "groq", GROQ_MODEL: "m" }))[0]).toBe("groq:m");
    const mixed = ids(loadLlmConfig({ ...keys, GROQ_MODEL: "openai/gpt-oss-20b" }));
    expect(mixed[0]).toBe("groq:openai/gpt-oss-20b");
    expect(mixed.filter((i) => i === "groq:openai/gpt-oss-20b")).toHaveLength(1);
    const fast = loadLlmConfig({ ...keys, GEMINI_MODEL: "gemini-3.5-flash-lite" }).fastChain.map((e) => `${e.provider}:${e.model}`);
    expect(fast[0].startsWith("groq:")).toBe(true);
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
    const llm = createLlm(
      loadLlmConfig({ GEMINI_API_KEY: "g", LLM_CHAIN_MAIN: "gemini:gemini-3.5-flash-lite,gemini:gemini-3.5-flash,gemini:gemini-2.5-flash" }),
      { fetchImpl, cache: false },
    );
    expect(await llm.chatJson({ system: "s", prompt: "a" })).toEqual({ ok: true });
    expect(llm.name).toBe("gemini:gemini-3.5-flash");
    await llm.chatJson({ system: "s", prompt: "b" });
    expect(urls.filter((u) => u.includes("flash-lite"))).toHaveLength(1);
  });

  it("sends Groq requests when the chain reaches Groq", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("groq") ? json({ choices: [{ message: { content: '{"g":1}' } }] }) : json({}, 503),
    ) as unknown as typeof fetch;
    const llm = createLlm(
      loadLlmConfig({ GEMINI_API_KEY: "g", GROQ_API_KEY: "q", LLM_CHAIN_MAIN: "gemini:gemini-3.5-flash,groq:openai/gpt-oss-120b" }),
      { fetchImpl, cache: false },
    );
    expect(await llm.chatJson({ system: "s", prompt: "a" })).toEqual({ g: 1 });
    expect(llm.name).toBe("groq:openai/gpt-oss-120b");
  });

  it("routes light-tier and fast-route requests to the fast chain and the rest to the main chain", async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      return json({ choices: [{ message: { content: "{}" } }] });
    }) as unknown as typeof fetch;
    const llm = createLlm(
      loadLlmConfig({ GROQ_API_KEY: "q", LLM_CHAIN_FAST: "groq:fast-model", LLM_CHAIN_MAIN: "groq:main-model" }),
      { fetchImpl, cache: false },
    );
    const bodies = () => (fetchImpl as unknown as { mock: { calls: [unknown, { body: string }][] } }).mock.calls.map((c) => JSON.parse(c[1].body).model);
    await llm.chatJson({ system: "s", prompt: "a", tier: "light" });
    await llm.chatJson({ system: "s", prompt: "b", tier: "main", route: "fast" });
    await llm.chatJson({ system: "s", prompt: "c", tier: "main" });
    expect(bodies()).toEqual(["fast-model", "fast-model", "main-model"]);
    expect(llm.name).toBe("groq:main-model");
  });

  it("shares cooldowns between chains: a model that hit its quota on one route is skipped on the other", async () => {
    const hits: string[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const model = JSON.parse(String(init?.body)).model as string;
      hits.push(model);
      return model === "a" ? json({ error: { message: "Rate limit" } }, 429, { "retry-after": "30" }) : json({ choices: [{ message: { content: "{}" } }] });
    }) as unknown as typeof fetch;
    const llm = createLlm(loadLlmConfig({ GROQ_API_KEY: "q", LLM_CHAIN_FAST: "groq:a,groq:b", LLM_CHAIN_MAIN: "groq:a,groq:c" }), { fetchImpl, cache: false });
    await llm.chatJson({ system: "s", prompt: "x", tier: "light" });
    await llm.chatJson({ system: "s", prompt: "y", tier: "main" });
    expect(hits).toEqual(["a", "b", "c"]);
  });
});
