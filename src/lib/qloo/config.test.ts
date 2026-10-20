import { describe, expect, it } from "vitest";
import { loadQlooConfig } from "./config";

describe("loadQlooConfig", () => {
  it("defaults to mock mode with the hackathon base URL", () => {
    expect(loadQlooConfig({})).toEqual({
      mode: "mock",
      apiKey: undefined,
      baseUrl: "https://hackathon.api.qloo.com",
    });
  });

  it("requires QLOO_API_KEY in live mode", () => {
    expect(() => loadQlooConfig({ QLOO_MODE: "live" })).toThrow(/QLOO_API_KEY/);
    expect(() => loadQlooConfig({ QLOO_MODE: "live", QLOO_API_KEY: "  " })).toThrow(/QLOO_API_KEY/);
  });

  it("accepts live mode with a key and trims trailing slashes from the base URL", () => {
    const cfg = loadQlooConfig({
      QLOO_MODE: "live",
      QLOO_API_KEY: "k",
      QLOO_BASE_URL: "https://example.test/",
    });
    expect(cfg).toEqual({ mode: "live", apiKey: "k", baseUrl: "https://example.test" });
  });

  it("rejects an unknown mode", () => {
    expect(() => loadQlooConfig({ QLOO_MODE: "staging" })).toThrow(/QLOO_MODE/);
  });

  it("rejects a malformed base URL", () => {
    expect(() => loadQlooConfig({ QLOO_BASE_URL: "not a url" })).toThrow(/QLOO_BASE_URL/);
    expect(() => loadQlooConfig({ QLOO_BASE_URL: "ftp://x.test" })).toThrow(/QLOO_BASE_URL/);
  });

  it("treats blank values as unset", () => {
    expect(loadQlooConfig({ QLOO_MODE: "", QLOO_BASE_URL: "" }).mode).toBe("mock");
  });

  it("does not leak the key in error messages", () => {
    let message = "";
    try {
      loadQlooConfig({ QLOO_MODE: "bogus", QLOO_API_KEY: "SECRET123" });
    } catch (e) {
      message = String(e);
    }
    expect(message).toMatch(/QLOO_MODE/);
    expect(message).not.toContain("SECRET123");
  });
});
