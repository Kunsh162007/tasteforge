import { describe, expect, it } from "vitest";
import { buildHealth, validateEnv } from "./env";

const ok = { QLOO_MODE: "mock", LLM_PROVIDER: "mock" };

describe("validateEnv", () => {
  it("accepts mock Qloo with the mock LLM", () => {
    expect(validateEnv(ok).errors).toEqual([]);
  });

  it("defaults are valid only when the Gemini key exists", () => {
    expect(validateEnv({}).errors[0]).toMatch(/GEMINI_API_KEY/);
    expect(validateEnv({ GEMINI_API_KEY: "k" }).errors).toEqual([]);
  });

  it("requires a key for live Qloo and names the fix", () => {
    const { errors } = validateEnv({ ...ok, QLOO_MODE: "live" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/QLOO_API_KEY/);
    expect(errors[0]).toMatch(/QLOO_MODE=mock/);
  });

  it("rejects an unknown mode, provider and a bad base URL", () => {
    expect(validateEnv({ ...ok, QLOO_MODE: "prod" }).errors[0]).toMatch(/QLOO_MODE/);
    expect(validateEnv({ ...ok, LLM_PROVIDER: "openai" }).errors[0]).toMatch(/LLM_PROVIDER/);
    expect(validateEnv({ ...ok, QLOO_BASE_URL: "nope" }).errors[0]).toMatch(/QLOO_BASE_URL/);
  });

  it("reports every problem at once", () => {
    expect(validateEnv({ QLOO_MODE: "live", LLM_PROVIDER: "groq" }).errors).toHaveLength(2);
  });

  it("warns, without failing, about demo-only settings in production", () => {
    const { errors, warnings } = validateEnv({ ...ok, NODE_ENV: "production" });
    expect(errors).toEqual([]);
    expect(warnings.join(" ")).toMatch(/mock/i);
  });

  it("warns in production when LEDGER_SECRET is missing or too short, never echoing it", () => {
    const missing = validateEnv({ ...ok, NODE_ENV: "production" }).warnings.join(" ");
    expect(missing).toMatch(/LEDGER_SECRET/);
    const short = validateEnv({ ...ok, NODE_ENV: "production", LEDGER_SECRET: "tiny-secret" }).warnings.join(" ");
    expect(short).toMatch(/LEDGER_SECRET/);
    expect(short).not.toContain("tiny-secret");
    const good = validateEnv({ ...ok, NODE_ENV: "production", LEDGER_SECRET: "0123456789abcdef0123" }).warnings.join(" ");
    expect(good).not.toMatch(/LEDGER_SECRET/);
  });

  it("never echoes a secret value", () => {
    const secret = "sk-very-secret-value";
    const { errors, warnings } = validateEnv({ QLOO_MODE: "live", QLOO_API_KEY: secret, LLM_PROVIDER: "gemini", GROQ_API_KEY: secret });
    expect(JSON.stringify([errors, warnings])).not.toContain(secret);
  });
});

describe("buildHealth", () => {
  it("reports booleans only and the version", () => {
    const health = buildHealth({ QLOO_MODE: "live", QLOO_API_KEY: "secret-q", LLM_PROVIDER: "gemini", GEMINI_API_KEY: "secret-g" }, "1.2.3");
    expect(health).toMatchObject({ status: "ok", version: "1.2.3", qloo: { mode: "live", keyConfigured: true }, llm: { provider: "gemini", gemini: true, groq: false } });
    expect(JSON.stringify(health)).not.toMatch(/secret/);
  });

  it("lists the model chain by name for keys that are present", () => {
    const health = buildHealth({ QLOO_MODE: "mock", GEMINI_API_KEY: "secret-g", LLM_CHAIN: "gemini:a,groq:b" }, "1");
    expect(health.llm.chain).toEqual(["gemini:a"]);
    expect(buildHealth({ QLOO_MODE: "mock", LLM_PROVIDER: "mock" }, "1").llm.chain).toEqual([]);
  });

  it("flags a misconfiguration as degraded", () => {
    const health = buildHealth({ QLOO_MODE: "live", LLM_PROVIDER: "mock" }, "1.0.0");
    expect(health.status).toBe("misconfigured");
    expect(health.problems.join(" ")).toMatch(/QLOO_API_KEY/);
  });
});
