import { describe, expect, it } from "vitest";
import { createCache } from "@/lib/qloo/cache";
import type { JsonRequest, LlmProvider } from "@/lib/llm";
import { coerceSeedPlan, extractSeeds, seedCacheKey, type SeedPlan } from "./seeds";

const REQUEST = { prompt: "A ceramics studio selling hand-thrown tableware", mode: "find_audience", city: "London" } as const;

function llmReturning(...replies: unknown[]): LlmProvider & { readonly requests: JsonRequest[] } {
  const requests: JsonRequest[] = [];
  return {
    name: "stub",
    requests,
    async chatJson(req) {
      requests.push(req);
      return replies[Math.min(requests.length - 1, replies.length - 1)];
    },
  };
}

describe("coerceSeedPlan", () => {
  it("keeps the whole plan when the model names a kind outside the menu", () => {
    const plan = coerceSeedPlan({
      seeds: [
        { name: "Muji", kind: "brand" },
        { name: "Studio Ghibli", kind: "film" },
        { name: "Radiohead", kind: "band" },
        { name: "Heath Ceramics", kind: "gizmo" },
      ],
      tags: ["slow living"],
      city: "London",
    });
    expect(plan?.seeds).toEqual([
      { name: "Muji", kind: "brand" },
      { name: "Studio Ghibli", kind: "movie" },
      { name: "Radiohead", kind: "artist" },
      { name: "Heath Ceramics", kind: "other" },
    ]);
    expect(plan?.tags).toEqual(["slow living"]);
  });

  it("drops one malformed seed instead of the plan, and trims lists that run over their limits", () => {
    const plan = coerceSeedPlan({
      seeds: [{ name: "" }, { kind: "brand" }, "Muji", { name: "Etsy", kind: "brand" }],
      tags: ["a", "b", "c", "d", "e", "f", "g", "h", 7, ""],
      musicTags: ["jazz", "folk", "blues", "rock"],
      venue: "studio",
    });
    expect(plan?.seeds.map((s) => s.name)).toEqual(["Etsy"]);
    expect(plan?.tags).toHaveLength(6);
    expect(plan?.musicTags).toEqual(["jazz", "folk", "blues"]);
    expect(plan?.venue).toBe("studio");
  });

  it("returns undefined when there is nothing to search with", () => {
    expect(coerceSeedPlan({ seeds: [], tags: [] })).toBeUndefined();
    expect(coerceSeedPlan("nope")).toBeUndefined();
    expect(coerceSeedPlan(null)).toBeUndefined();
  });
});

describe("extractSeeds", () => {
  it("asks again once when the first reply is unusable, then falls back to the prompt text", async () => {
    const llm = llmReturning({ oops: true });
    const plan = await extractSeeds(llm, REQUEST, undefined);
    expect(llm.requests).toHaveLength(2);
    expect(plan.seeds).toEqual([]);
    expect(plan.tags[0]).toContain("ceramics");
  });

  it("uses the second reply when the first was unusable", async () => {
    const llm = llmReturning({ nothing: 1 }, { seeds: [], tags: ["slow living"] });
    const plan = await extractSeeds(llm, REQUEST, undefined);
    expect(plan.tags).toEqual(["slow living"]);
  });

  it("answers a repeated prompt from the cache, whatever its spacing and case", async () => {
    const cache = createCache<SeedPlan>({ maxEntries: 10, ttlMs: 60_000 });
    const llm = llmReturning({ seeds: [{ name: "Muji", kind: "brand" }], tags: ["slow living"] });
    const first = await extractSeeds(llm, REQUEST, cache);
    const again = await extractSeeds(llm, { ...REQUEST, prompt: `  ${REQUEST.prompt.toUpperCase()}  `, city: "london" }, cache);
    expect(llm.requests).toHaveLength(1);
    expect(again).toEqual(first);
  });

  it("does not share a cached plan between modes or cities, and never caches a fallback", async () => {
    const cache = createCache<SeedPlan>({ maxEntries: 10, ttlMs: 60_000 });
    const llm = llmReturning({ seeds: [], tags: ["x"] });
    await extractSeeds(llm, REQUEST, cache);
    await extractSeeds(llm, { ...REQUEST, mode: "know_audience" }, cache);
    await extractSeeds(llm, { ...REQUEST, city: "Paris" }, cache);
    expect(llm.requests).toHaveLength(3);
    expect(seedCacheKey(REQUEST)).not.toBe(seedCacheKey({ ...REQUEST, city: "Paris" }));

    const broken = llmReturning({ junk: 1 });
    await extractSeeds(broken, { ...REQUEST, prompt: "something else entirely" }, cache);
    await extractSeeds(broken, { ...REQUEST, prompt: "something else entirely" }, cache);
    expect(broken.requests).toHaveLength(4);
  });
});
