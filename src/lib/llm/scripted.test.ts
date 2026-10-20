import { describe, expect, it } from "vitest";
import { generateBrief, type AgentEvent } from "@/lib/agent";
import { createQlooClient } from "@/lib/qloo";
import { createLlm } from "./index";
import { loadLlmConfig } from "./config";

describe("LLM_PROVIDER=mock", () => {
  it("needs no API key", () => {
    expect(loadLlmConfig({ LLM_PROVIDER: "mock" }).provider).toBe("mock");
  });

  it("drives a full grounded brief and taste proof offline", async () => {
    const events: AgentEvent[] = [];
    const result = await generateBrief({
      prompt: "A cafe for young professionals who love Radiohead, indie music and slow living.",
      mode: "know_audience",
      city: "Indore",
      llm: createLlm(loadLlmConfig({ LLM_PROVIDER: "mock" })),
      qloo: createQlooClient({ mode: "mock", baseUrl: "https://hackathon.api.qloo.com" }),
      allowNeedsInput: false,
      onEvent: (e) => events.push(e),
    });
    expect(result.ok).toBe(true);
    expect(result.brief?.groundingScore).toBe(1);
    expect(result.brief?.sound.artists.length).toBeGreaterThan(0);
    expect(result.brief?.aesthetic.palette.length).toBeGreaterThan(0);
    // Indian-city baseline: some names Qloo knows (with lower scores), some it cannot find.
    expect(result.proof?.baselineNotFound).toBeGreaterThan(0);
    expect(result.proof?.baselineNotFound).toBeLessThan(result.proof?.baseline.length ?? 0);
    expect(result.proof?.baselineAvg).not.toBeNull();
    expect(result.proof?.tasteforgeAvg ?? 0).toBeGreaterThan(result.proof?.baselineAvg ?? 1);
  });
});
