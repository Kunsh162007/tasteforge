import { describe, expect, it } from "vitest";
import { LlmError } from "@/lib/llm";
import { createQlooClient, QlooError, type QlooClient, type QlooEntity } from "@/lib/qloo";
import type { AgentEvent } from "../events";
import { draftFromPrompt, routedLlm, type Routes } from "../testing";
import { runPipeline, type PipelineOptions } from "./index";

const mock = createQlooClient({ mode: "mock", baseUrl: "https://hackathon.api.qloo.com" });

const SEEDS = { seeds: [{ name: "Velvet Static", kind: "artist" }], tags: ["indie", "cosy cafes"], audienceHints: "Dreamy crowd" };
const goodRoutes = (over: Routes = {}): Routes => ({
  seeds: SEEDS,
  critic: { followUps: [] },
  synthesis: (req) => draftFromPrompt(req.prompt),
  ...over,
});

async function run(routes: Routes, over: Partial<PipelineOptions> = {}) {
  const events: AgentEvent[] = [];
  const llm = routedLlm(routes);
  const result = await runPipeline({
    prompt: "Dream-pop fans who love cosy cafes",
    mode: "know_audience",
    city: "Brooklyn",
    llm,
    qloo: mock,
    onEvent: (e) => events.push(e),
    ...over,
  });
  return { result, events, llm };
}

const stages = (events: AgentEvent[]) =>
  events.flatMap((e) => (e.type === "stage" ? [`${e.stage}:${e.status}`] : []));

describe("runPipeline when the model has to queue", () => {
  it("passes the run's deadline and turns a wait into a queue event before the brief", async () => {
    let deadline: number | undefined;
    const routes = goodRoutes({
      synthesis: (req) => {
        deadline = req.deadlineAt;
        req.onWait?.({ waitMs: 7_400 });
        return draftFromPrompt(req.prompt);
      },
    });
    const { result, events } = await run(routes);
    expect(result.ok).toBe(true);
    expect(deadline).toBeGreaterThan(Date.now());
    const kinds = events.map((e) => e.type);
    expect(events.find((e) => e.type === "queue")).toEqual({ type: "queue", waitSeconds: 7 });
    expect(kinds.indexOf("queue")).toBeLessThan(kinds.indexOf("brief"));
  });
});

describe("runPipeline model attribution", () => {
  it("names the model that answered this run's synthesis, not the shared cascade's latest answer", async () => {
    const routes = goodRoutes({
      synthesis: (req) => {
        req.onAnswered?.("groq:qwen/qwen3.8-27b");
        return draftFromPrompt(req.prompt);
      },
    });
    const { result } = await run(routes);
    expect(result.brief?.model).toBe("groq:qwen/qwen3.8-27b");
  });
});

describe("runPipeline with preset signals (city comparison)", () => {
  const signals = { entityIds: ["MOCK-ARTIST-1"], tagIds: [], entityNames: ["Velvet Static"], tagNames: [] };

  it("skips extraction and resolution: one LLM call and no Qloo search", async () => {
    const { result, events, llm } = await run(goodRoutes(), { presetSignals: signals, city: "London" });
    expect(result.ok).toBe(true);
    expect(llm.calls).toEqual(["synthesis"]);
    expect(events.some((e) => e.type === "tool_call" && (e.name === "qloo_search" || e.name === "qloo_find_tags"))).toBe(false);
    expect(stages(events).slice(0, 4)).toEqual(["seeds:start", "seeds:done", "resolve:start", "resolve:done"]);
    expect(events.find((e) => e.type === "stage" && e.stage === "seeds" && e.status === "done")).toMatchObject({ detail: "reused" });
    expect(result.signals).toEqual(signals);
    expect(result.city).toBe("London");
  });

  it("still walks the new city", async () => {
    const { events } = await run(goodRoutes(), { presetSignals: signals, city: "London" });
    const heat = events.find((e) => e.type === "tool_call" && e.name === "qloo_heatmap");
    expect(heat && heat.type === "tool_call" ? heat.args.location : undefined).toBe("London");
  });
});

describe("runPipeline happy path", () => {
  it("runs every stage in order with only two LLM calls when coverage is good", async () => {
    const { result, events, llm } = await run(goodRoutes());
    expect(result.ok).toBe(true);
    expect(stages(events)).toEqual([
      "seeds:start",
      "seeds:done",
      "resolve:start",
      "resolve:done",
      "walk:start",
      "walk:done",
      "critic:start",
      "critic:done",
      "synthesis:start",
      "synthesis:done",
    ]);
    expect(llm.calls).toEqual(["seeds", "synthesis"]);
    expect(events.at(-1)?.type).toBe("brief");
    expect(result.brief?.groundingScore).toBe(1);
    expect(result.brief?.mode).toBe("know_audience");
  });

  it("walks sections in parallel, recording every call as tool events with evidence ids", async () => {
    const { result, events } = await run(goodRoutes());
    const names = events.flatMap((e) => (e.type === "tool_call" ? [e.name] : []));
    expect(names).toEqual(expect.arrayContaining(["qloo_search", "qloo_find_tags", "qloo_heatmap", "qloo_demographics", "qloo_trending", "qloo_entity_tags"]));
    const results = events.filter((e) => e.type === "tool_result");
    expect(results.every((e) => e.ok)).toBe(true);
    const ids = result.ledger.records.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(results.map((e) => (e.type === "tool_result" ? e.evidenceId : ""))).toEqual(expect.arrayContaining(ids));
  });

  it("attaches sectionConfidence and cites every ledger record in the brief event", async () => {
    const { result, events } = await run(goodRoutes());
    expect(result.brief?.sectionConfidence).toMatchObject({ sound: "high", pairings: "high", aesthetic: "high" });
    const brief = events.find((e) => e.type === "brief");
    expect(brief && brief.type === "brief" ? brief.evidence.length : 0).toBe(result.ledger.records.length);
    expect(result.signals?.entityIds).toEqual(["MOCK-ARTIST-1"]);
  });

  it("skips place sections without a city and takes the city from the seeds when not given", async () => {
    const noCity = await run(goodRoutes(), { city: undefined });
    expect(noCity.events.some((e) => e.type === "tool_call" && e.name === "qloo_heatmap")).toBe(false);
    expect(noCity.result.city).toBeUndefined();
    const extracted = await run(goodRoutes({ seeds: { ...SEEDS, city: "Brooklyn" } }), { city: undefined });
    expect(extracted.result.city).toBe("Brooklyn");
    expect(extracted.events.some((e) => e.type === "tool_call" && e.name === "qloo_heatmap")).toBe(true);
  });

  it("works in find_audience mode from concept tags alone", async () => {
    const { result } = await run(goodRoutes({ seeds: { seeds: [], tags: ["slow living", "japanese ceramics"] } }), {
      mode: "find_audience",
    });
    expect(result.ok).toBe(true);
    expect(result.signals?.entityIds).toEqual([]);
    expect(result.signals?.tagNames).toEqual(expect.arrayContaining(["Slow Living"]));
  });

  it("drops null fields from model JSON and dedupes seeds", async () => {
    const seeds = { seeds: [{ name: "Velvet Static", kind: "artist" }, { name: "velvet static", kind: "artist" }], tags: ["indie"], city: null };
    const { result, events } = await run(goodRoutes({ seeds }), { city: undefined });
    expect(result.ok).toBe(true);
    expect(events.filter((e) => e.type === "tool_call" && e.name === "qloo_search")).toHaveLength(1);
  });
});

describe("runPipeline ambiguity", () => {
  const two: QlooEntity[] = [
    { id: "P1", name: "Paris", type: "urn:entity:place" },
    { id: "M1", name: "Paris", type: "urn:entity:movie" },
  ];
  const ambiguous: QlooClient = { ...mock, search: async () => ({ data: two }) };
  const seeds = { seeds: [{ name: "Paris", kind: "other" }], tags: ["indie"] };

  it("emits needs_input and stops when a seed is ambiguous", async () => {
    const { result, events } = await run(goodRoutes({ seeds }), { qloo: ambiguous });
    expect(result.ok).toBe(false);
    expect(result.needsInput?.options).toEqual([
      { label: "Paris (place)", qlooId: "P1", kind: "place" },
      { label: "Paris (movie)", qlooId: "M1", kind: "movie" },
    ]);
    expect(events.at(-1)).toMatchObject({ type: "needs_input" });
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(stages(events)).toContain("resolve:done");
  });

  it("continues with the user's selection", async () => {
    const { result } = await run(goodRoutes({ seeds }), { qloo: ambiguous, selections: ["M1"] });
    expect(result.ok).toBe(true);
    expect(result.signals?.entityIds).toEqual(["M1"]);
  });

  it("takes the chosen id into the signals even when this round's seeds no longer match it", async () => {
    const drifted = goodRoutes({ seeds: { seeds: [{ name: "Something else entirely", kind: "other" }], tags: ["indie"] } });
    const { result, events } = await run(drifted, { qloo: ambiguous, selections: ["MOCK-BRAND-77"] });
    expect(events.some((e) => e.type === "needs_input")).toBe(false);
    expect(result.ok).toBe(true);
    expect(result.signals?.entityIds).toContain("MOCK-BRAND-77");
  });

  it("auto-picks the top match when asking is disabled", async () => {
    const { result } = await run(goodRoutes({ seeds }), { qloo: ambiguous, allowNeedsInput: false });
    expect(result.ok).toBe(true);
    expect(result.signals?.entityIds).toEqual(["P1"]);
  });
});

describe("runPipeline critic", () => {
  const weakCity = { city: "Atlantis" };

  it("skips the model when coverage is fine, calls it for thin sections and applies allowed follow-ups", async () => {
    const critic = { followUps: [{ section: "aesthetic", type: "place", strategy: "drop_location", reason: "city thin" }] };
    const { result, events, llm } = await run(goodRoutes({ critic }), weakCity);
    expect(result.ok).toBe(true);
    expect(llm.calls.filter((c) => c === "critic").length).toBeGreaterThanOrEqual(1);
    const insights = events.filter((e) => e.type === "tool_call" && e.name === "qloo_insights" && e.args.type === "place" && e.args.widened === undefined);
    expect(insights).toHaveLength(2);
    expect(insights[1].type === "tool_call" && insights[1].args.location).toBeUndefined();
    expect(result.stats?.get("aesthetic")?.fallbacks).toEqual(["drop_location"]);
    // fallback used, so aesthetic cannot be "high"
    expect(result.brief?.sectionConfidence?.aesthetic).not.toBe("high");
    expect(stages(events)).toContain("critic:done");
    const done = events.find((e) => e.type === "stage" && e.stage === "critic" && e.status === "done");
    expect(done && done.type === "stage" ? done.detail : "").toMatch(/follow-up/);
  });

  it("caps the critic at two rounds and ignores off-menu or repeated follow-ups", async () => {
    const critic = {
      followUps: [
        { section: "where", type: "place", strategy: "more_results" },
        { section: "where", type: "place", strategy: "more_results" },
        { section: "sound", type: "artist", strategy: "delete_everything" },
        "garbage",
      ],
    };
    const { result, llm } = await run(goodRoutes({ critic }), weakCity);
    expect(result.ok).toBe(true);
    expect(llm.calls.filter((c) => c === "critic").length).toBeLessThanOrEqual(2);
  });

  it("supports tags_only and entities_only strategies and skips them when the signal is missing", async () => {
    const critic = {
      followUps: [
        { section: "aesthetic", type: "place", strategy: "tags_only" },
        { section: "aesthetic", type: "place", strategy: "entities_only" },
      ],
    };
    const noEntities = await run(goodRoutes({ critic, seeds: { seeds: [], tags: ["indie"] } }), weakCity);
    const calls = noEntities.events.filter((e) => e.type === "tool_call" && e.name === "qloo_insights" && e.args.type === "place" && e.args.widened === undefined);
    // first-pass place query + tags_only (entities_only has no entities to use)
    expect(calls).toHaveLength(2);
  });

  it("never fails the run when the critic call fails", async () => {
    const { result, events } = await run(goodRoutes({ critic: new LlmError("gemini", "rate_limit", "x", 429) }), weakCity);
    expect(result.ok).toBe(true);
    const done = events.find((e) => e.type === "stage" && e.stage === "critic" && e.status === "done");
    expect(done && done.type === "stage" ? done.detail : "").toMatch(/unavailable/);
  });
});

describe("runPipeline synthesis", () => {
  it("repairs an invalid first reply once", async () => {
    let n = 0;
    const synthesis = (req: { prompt: string }) => {
      n += 1;
      if (n === 1) return { nope: true };
      expect(req.prompt).toMatch(/previous reply was rejected/);
      return draftFromPrompt(req.prompt);
    };
    const { result, llm } = await run(goodRoutes({ synthesis }));
    expect(result.ok).toBe(true);
    expect(llm.calls.filter((c) => c === "synthesis")).toHaveLength(2);
  });

  it("fails with a retryable error after two invalid replies", async () => {
    const { result, events } = await run(goodRoutes({ synthesis: { nope: true } }));
    expect(result.ok).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: "error", retryable: true });
  });

  it("strips ungrounded items through the validator and reports them", async () => {
    const synthesis = (req: { prompt: string }) => {
      const d = draftFromPrompt(req.prompt) as { pairings: { label: string; evidence: string[] }[] };
      return { ...d, pairings: [...d.pairings, { label: "Made-up brand", evidence: ["ev_999"] }] };
    };
    const { result } = await run(goodRoutes({ synthesis }));
    expect(result.dropped).toEqual([expect.objectContaining({ label: "Made-up brand", reason: "unknown_evidence" })]);
    expect(result.brief?.groundingScore).toBeLessThan(1);
  });
});

describe("runPipeline failures", () => {
  it("reports a retryable error when the LLM is rate limited", async () => {
    const { result, events } = await run(goodRoutes({ seeds: new LlmError("gemini", "rate_limit", "x", 429) }));
    expect(result.ok).toBe(false);
    expect(result.cause).toBe("gemini rate_limit HTTP 429");
    expect(events.at(-1)).toMatchObject({ type: "error", retryable: true });
  });

  it("reports a non-retryable error for bad LLM credentials", async () => {
    const { events } = await run(goodRoutes({ seeds: new LlmError("gemini", "auth", "x", 401) }));
    expect(events.at(-1)).toMatchObject({ type: "error", retryable: false });
  });

  it("falls back to the prompt text when the seed JSON is unusable", async () => {
    const { result, events } = await run(goodRoutes({ seeds: { totally: "wrong" } }), { prompt: "indie cosy cafe" });
    expect(result.ok).toBe(true);
    const tagCall = events.find((e) => e.type === "tool_call" && e.name === "qloo_find_tags");
    expect(tagCall && tagCall.type === "tool_call" ? tagCall.args.query : "").toBe("indie cosy cafe");
  });

  it("asks for a clearer request when nothing resolves", async () => {
    const { result, events } = await run(goodRoutes({ seeds: { seeds: [{ name: "Zzyzx Qwerty", kind: "artist" }], tags: [] } }), {
      prompt: "zzzzqq xxxxyy",
    });
    expect(result.ok).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: "error", retryable: false });
    expect(result.error).toMatch(/could not match/);
  });

  it("surfaces a Qloo outage as retryable and a bad Qloo key as not retryable", async () => {
    const down: QlooClient = Object.fromEntries(
      Object.keys(mock).map((k) => [k, async () => { throw new QlooError("network", "net"); }]),
    ) as unknown as QlooClient;
    const outage = await run(goodRoutes(), { qloo: down });
    expect(outage.events.at(-1)).toMatchObject({ type: "error", retryable: true });
    const badKey: QlooClient = Object.fromEntries(
      Object.keys(mock).map((k) => [k, async () => { throw new QlooError("auth", "key", 401); }]),
    ) as unknown as QlooClient;
    const auth = await run(goodRoutes(), { qloo: badKey });
    expect(auth.events.at(-1)).toMatchObject({ type: "error", retryable: false });
  });

  it("fails with a retryable error when walk data is entirely empty", async () => {
    const emptyWalk: QlooClient = {
      ...mock,
      insights: async () => ({ data: [] }),
      demographics: async () => ({ data: [] }),
      heatmap: async () => ({ data: [] }),
    };
    const { result, events } = await run(goodRoutes(), { qloo: emptyWalk });
    expect(result.ok).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: "error", retryable: false });
  });

  it("times out when the model hangs", async () => {
    const hang = () => new Promise<never>(() => {});
    const { result, events } = await run(goodRoutes({ seeds: hang }), { timeoutMs: 20 });
    expect(result.ok).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: "error", retryable: true });
    expect(result.error).toMatch(/too long/);
  });
});

describe("hotspot naming", () => {
  const unnamedHeat: QlooClient = {
    ...mock,
    heatmap: async () => ({
      data: [
        { geohash: "a", latitude: 22.75, longitude: 75.89, affinity: 0.9 },
        { geohash: "b", latitude: 22.72, longitude: 75.88, affinity: 0.7 },
      ],
    }),
  };

  it("replaces coordinate-only hotspot names using the geocoder", async () => {
    const seen: [number, number][] = [];
    const geocode = async (lat: number, lon: number) => {
      seen.push([lat, lon]);
      return lat > 22.74 ? "Vijay Nagar" : undefined;
    };
    const { result } = await run(goodRoutes(), { qloo: unnamedHeat, geocode });
    const heat = result.ledger.records.find((r) => r.summary.includes("heatmap hotspots"));
    expect(heat?.entities?.map((e) => e.name)).toEqual(["Vijay Nagar", "Area near 22.720, 75.880"]);
    expect(heat?.summary).toContain("hottest: Vijay Nagar");
    expect(seen).toHaveLength(2);
  });

  it("keeps placeholders without a geocoder and skips cells that already have names", async () => {
    const { result } = await run(goodRoutes(), { qloo: unnamedHeat });
    expect(result.ledger.records.find((r) => r.summary.includes("heatmap hotspots"))?.entities?.[0].name).toMatch(/^Area near/);
    let calls = 0;
    const { result: named } = await run(goodRoutes(), { geocode: async () => { calls += 1; return "x"; } });
    expect(calls).toBe(0);
    expect(named.ledger.records.find((r) => r.summary.includes("heatmap hotspots"))?.entities?.[0].name).toBe("Williamsburg");
  });
});

describe("runPipeline time budget", () => {
  /** Qloo whose place and tag-analysis calls never answer. */
  function stuckPlaces(): QlooClient {
    const never = new Promise<never>(() => undefined);
    return {
      ...mock,
      insights: (p) => (p.type === "urn:entity:place" ? never : mock.insights(p)),
      entityTags: () => never,
    };
  }

  it("writes the brief from what arrived when the walk runs out of time, and marks the missing sections", async () => {
    const { result, events } = await run(goodRoutes(), { qloo: stuckPlaces(), timeoutMs: 400 });
    expect(result.ok).toBe(true);
    expect(events.find((e) => e.type === "stage" && e.stage === "walk" && e.status === "done")).toMatchObject({ detail: expect.stringContaining("partial") });
    expect(result.brief?.sectionConfidence?.aesthetic).toBe("low");
    expect(result.brief?.sectionConfidence?.sound).not.toBe("low");
    const left = events.filter((e) => e.type === "tool_result" && !e.ok && e.summary.startsWith("Left out"));
    expect(left.length).toBeGreaterThan(0);
  });

  it("every started call ends with a tool_result, and nothing is reported after the brief", async () => {
    const { events } = await run(goodRoutes(), { qloo: stuckPlaces(), timeoutMs: 400 });
    const started = events.filter((e) => e.type === "tool_call").map((e) => (e.type === "tool_call" ? e.id : ""));
    const ended = new Set(events.flatMap((e) => (e.type === "tool_result" ? [e.id] : [])));
    expect(started.every((id) => ended.has(id))).toBe(true);
    expect(events.at(-1)?.type).toBe("brief");
  });

  it("does not wait for trending: a trending call that never answers is left out", async () => {
    const never = new Promise<never>(() => undefined);
    const qloo: QlooClient = { ...mock, trending: () => never };
    const started = Date.now();
    const { result, events } = await run(goodRoutes(), { qloo, timeoutMs: 20_000 });
    expect(result.ok).toBe(true);
    expect(Date.now() - started).toBeLessThan(8_000);
    expect(events.some((e) => e.type === "tool_result" && e.name === "qloo_trending" && !e.ok && e.summary.startsWith("Left out"))).toBe(true);
  });

  it("reports how long each call took", async () => {
    const { events } = await run(goodRoutes());
    const results = events.filter((e) => e.type === "tool_result");
    expect(results.length).toBeGreaterThan(5);
    expect(results.every((e) => typeof e.durationMs === "number" && e.durationMs >= 0)).toBe(true);
  });
});
