import { afterEach, describe, expect, it, vi } from "vitest";
import { createQlooClient, type QlooClient } from "@/lib/qloo";
import type { Brief } from "./brief";
import { generateBrief } from "./generate";
import type { AgentEvent } from "./events";
import type { Ledger } from "./ledger";
import { fetchBaselineNames, resolveBaseline, scoreProof, startBaseline, tasteforgePicks, type PickRef } from "./proof";
import { draftFromPrompt, makeDraft, routedLlm, type Routes } from "./testing";

const qloo = createQlooClient({ mode: "mock", baseUrl: "https://hackathon.api.qloo.com" });
const signals = { entityIds: ["MOCK-ARTIST-1"], tagIds: ["urn:tag:genre:media:indie"], entityNames: [], tagNames: [] };

const baselineReply = {
  artists: ["Taylor Swift", "Phoebe Bridgers", "taylor swift", "Nobody Known Xyz", " "],
  places: ["Blue Bottle Coffee", "Unknown Cafe Qq"],
  brands: ["Starbucks", "IKEA", "Nike", "Zara", "Apple", "Muji"],
};

describe("baseline", () => {
  it("dedupes names, drops blanks and caps per kind", async () => {
    const llm = routedLlm({ baseline: baselineReply });
    const picks = await fetchBaselineNames(llm, { prompt: "p", city: "Brooklyn" });
    expect(picks.filter((p) => p.kind === "artist").map((p) => p.name)).toEqual(["Taylor Swift", "Phoebe Bridgers", "Nobody Known Xyz"]);
    expect(picks.filter((p) => p.kind === "brand")).toHaveLength(4);
  });

  it("accepts a reply that lists more names than asked for or a very long name, instead of losing the whole proof", async () => {
    const llm = routedLlm({
      baseline: { artists: Array.from({ length: 14 }, (_, i) => `Artist ${i}`), places: [`The ${"Very ".repeat(30)}Long Cafe`], brands: ["Nike"] },
    });
    const picks = await fetchBaselineNames(llm, { prompt: "p", city: "Brooklyn" });
    expect(picks.filter((p) => p.kind === "artist")).toHaveLength(6);
    expect(picks.find((p) => p.kind === "place")?.name.length).toBeLessThanOrEqual(80);
    expect(picks.filter((p) => p.kind === "brand")).toHaveLength(1);
  });

  it("returns nothing for an unusable reply and never rejects when started in the background", async () => {
    expect(await fetchBaselineNames(routedLlm({ baseline: { wrong: 1 } }), { prompt: "p" })).toEqual([]);
    expect(await startBaseline(routedLlm({ baseline: new Error("boom") }), qloo, { prompt: "p" })).toEqual([]);
  });

  it("resolves found names to ids and leaves unknown or failing ones without", async () => {
    const picks: PickRef[] = [
      { name: "Phoebe Bridgers", kind: "artist" },
      { name: "Nobody Known Xyz", kind: "artist" },
    ];
    const resolved = await resolveBaseline(qloo, picks);
    expect(resolved[0].qlooId).toBe("MOCK-MAIN-ARTIST-6");
    expect(resolved[1].qlooId).toBeUndefined();
    const broken: QlooClient = { ...qloo, search: async () => { throw new Error("x"); } };
    expect((await resolveBaseline(broken, picks))[0].qlooId).toBeUndefined();
  });
});

describe("tasteforgePicks", () => {
  const ledger: Ledger = {
    records: [
      { id: "ev_1", endpoint: "/v2/insights", params: { type: "artist" }, summary: "s", entities: [{ id: "A1", name: "Velvet Static (band)" }, { id: "A2", name: "Moth Choir (band)" }] },
      { id: "ev_2", endpoint: "/v2/insights", params: { type: "place" }, summary: "s", entities: [{ id: "P1", name: "Cafe Lumen" }] },
      { id: "ev_3", endpoint: "/v2/insights", params: { type: "brand" }, summary: "s", entities: [{ id: "B1", name: "Fernwick Goods (brand)" }] },
      { id: "ev_4", endpoint: "/search", params: { types: "artist" }, summary: "s", entities: [{ id: "A3", name: "Seed Band" }] },
    ],
  };
  const brief = {
    ...makeDraft(["ev_1"]),
    sound: { direction: "d", artists: [{ label: "x", evidence: ["ev_1"], qlooId: "A1" }, { label: "moth choir", evidence: ["ev_1"] }, { label: "Unlisted", evidence: ["ev_1"] }] },
    aesthetic: { palette: [], lighting: [], materials: [], referencePlaces: [{ label: "Cafe Lumen", evidence: ["ev_2"], qlooId: "A1" }] },
    pairings: [{ label: "Oat latte idea", evidence: ["ev_3"] }, { label: "Fernwick Goods", evidence: ["ev_3"] }],
    mode: "know_audience",
    groundingScore: 1,
  } as Brief;

  it("maps brief items to ledger entities by id or label, ignoring non-entities and wrong-kind ids", () => {
    expect(tasteforgePicks(brief, ledger)).toEqual([
      { name: "Velvet Static (band)", kind: "artist", qlooId: "A1", evidence: ["ev_1"] },
      { name: "Moth Choir (band)", kind: "artist", qlooId: "A2", evidence: ["ev_1"] },
      { name: "Cafe Lumen", kind: "place", qlooId: "P1", evidence: ["ev_2"], local: false },
      { name: "Fernwick Goods (brand)", kind: "brand", qlooId: "B1", evidence: ["ev_3"] },
    ]);
  });

  it("marks a place local only when Qloo has both its address and coordinates, and keeps the address for display", () => {
    const located: Ledger = {
      records: [
        { id: "ev_2", endpoint: "/v2/insights", params: { type: "place" }, summary: "s", entities: [{ id: "P1", name: "Cafe Lumen", note: "12 Bank St Brooklyn | $$ 4.5/5", lat: 40.7, lon: -73.9 }, { id: "P2", name: "No Coords", note: "1 A St" }] },
      ],
    };
    const b = { ...brief, aesthetic: { ...brief.aesthetic, referencePlaces: [{ label: "Cafe Lumen", evidence: ["ev_2"] }, { label: "No Coords", evidence: ["ev_2"] }] } } as Brief;
    const places = tasteforgePicks(b, located).filter((p) => p.kind === "place");
    expect(places).toEqual([
      { name: "Cafe Lumen", kind: "place", qlooId: "P1", evidence: ["ev_2"], address: "12 Bank St Brooklyn", local: true },
      { name: "No Coords", kind: "place", qlooId: "P2", evidence: ["ev_2"], address: "1 A St", local: false },
    ]);
  });
});

describe("scoreProof", () => {
  const baseline: PickRef[] = [
    { name: "Taylor Swift", kind: "artist", qlooId: "MOCK-MAIN-ARTIST-1" },
    { name: "Nobody", kind: "artist" },
    { name: "Starbucks", kind: "brand", qlooId: "MOCK-MAIN-BRAND-1" },
    { name: "Blue Bottle Coffee", kind: "place", qlooId: "MOCK-MAIN-PLACE-2" },
  ];
  const tasteforge: PickRef[] = [
    { name: "Paper Lanterns (band)", kind: "artist", qlooId: "MOCK-ARTIST-2" },
    { name: "Fernwick Goods (brand)", kind: "brand", qlooId: "MOCK-BRAND-1" },
  ];

  it("scores both lists with the same signals; TasteForge wins and unfound picks are null", async () => {
    const proof = await scoreProof({ qloo, signals, baseline, tasteforge });
    expect(proof?.tasteforgeAvg ?? 0).toBeGreaterThan(proof?.baselineAvg ?? 1);
    expect(proof?.baselineNotFound).toBe(1);
    expect(proof?.baseline.find((p) => p.name === "Nobody")?.affinity).toBeNull();
    // places are skipped: TasteForge has no place picks to compare
    expect(proof?.baseline.some((p) => p.kind === "place")).toBe(false);
    expect(proof?.tasteforge.map((p) => p.affinity)).toEqual([0.9, 0.92]);
  });

  it("keeps a seed out by name even when Qloo gave it another id, and carries traceability onto scored picks", async () => {
    const proof = await scoreProof({
      qloo,
      signals: { ...signals, entityNames: ["Seed Band"] },
      baseline,
      tasteforge: [...tasteforge.map((p, i) => ({ ...p, evidence: [`ev_${i + 1}`], local: undefined })), { name: "seed band (band)", kind: "artist", qlooId: "MOCK-ARTIST-3" }],
      city: "Brooklyn",
    });
    expect(proof?.tasteforge.map((p) => p.name)).not.toContain("seed band (band)");
    expect(proof?.tasteforge[0].evidence).toEqual(["ev_1"]);
    expect(proof?.city).toBe("Brooklyn");
  });

  it("leaves the user's own seeds out of both lists", async () => {
    const proof = await scoreProof({
      qloo,
      signals,
      baseline,
      tasteforge: [...tasteforge, { name: "Seed", kind: "artist", qlooId: "MOCK-ARTIST-1" }],
    });
    expect(proof?.tasteforge.map((p) => p.name)).not.toContain("Seed");
  });

  it("drops a kind when scoring fails and returns undefined without signals or picks", async () => {
    const flaky: QlooClient = { ...qloo, insights: async (p) => { if (p.type.endsWith("brand")) throw new Error("x"); return qloo.insights(p); } };
    const proof = await scoreProof({ qloo: flaky, signals, baseline, tasteforge });
    expect(proof?.tasteforge.map((p) => p.kind)).toEqual(["artist"]);
    expect(await scoreProof({ qloo, signals: { ...signals, entityIds: [], tagIds: [] }, baseline, tasteforge })).toBeUndefined();
    expect(await scoreProof({ qloo, signals, baseline, tasteforge: [] })).toBeUndefined();
    const none: QlooClient = { ...qloo, insights: async () => { throw new Error("x"); } };
    expect(await scoreProof({ qloo: none, signals, baseline, tasteforge })).toBeUndefined();
  });

  it("reports n/a (null) instead of 0 when none of a list's picks were found", async () => {
    const proof = await scoreProof({ qloo, signals, baseline: [{ name: "n", kind: "artist" }], tasteforge });
    expect(proof?.baselineAvg).toBeNull();
    expect(proof?.baselineNotFound).toBe(1);
    expect(proof?.tasteforgeAvg).not.toBeNull();
  });

  it("averages only over picks Qloo found", async () => {
    const proof = await scoreProof({
      qloo,
      signals,
      baseline: [{ name: "Taylor Swift", kind: "artist", qlooId: "MOCK-MAIN-ARTIST-1" }, { name: "n", kind: "artist" }, { name: "m", kind: "artist" }],
      tasteforge,
    });
    const found = proof?.baseline.filter((p) => p.affinity !== null) ?? [];
    expect(found).toHaveLength(1);
    expect(proof?.baselineAvg).toBe(found[0].affinity);
  });
});

describe("scorePick coverage gaps", () => {
  it("gives null, not 0, to a pick Qloo did not score, and leaves it out of the average", async () => {
    const partial: QlooClient = {
      ...qloo,
      insights: async () => ({
        data: [
          { id: "MOCK-MAIN-ARTIST-1", name: "Taylor Swift", type: "urn:entity:artist", affinity: 0.4 },
          { id: "MOCK-ARTIST-2", name: "Paper Lanterns", type: "urn:entity:artist", affinity: 0.8 },
        ],
      }),
    };
    const proof = await scoreProof({
      qloo: partial,
      signals,
      baseline: [
        { name: "Taylor Swift", kind: "artist", qlooId: "MOCK-MAIN-ARTIST-1" },
        { name: "Unscored", kind: "artist", qlooId: "MOCK-MAIN-ARTIST-404" },
      ],
      tasteforge: [{ name: "Paper Lanterns", kind: "artist", qlooId: "MOCK-ARTIST-2" }],
    });
    expect(proof?.baseline.map((p) => p.affinity)).toEqual([0.4, null]);
    expect(proof?.baselineAvg).toBe(0.4);
    expect(proof?.baselineNotFound).toBe(1);
  });
});

describe("proof logging", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs a warning, without the pick name, when a baseline lookup, scoring call or baseline fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const broken: QlooClient = {
      ...qloo,
      search: async () => {
        throw new Error("search down");
      },
      insights: async () => {
        throw new Error("insights down");
      },
    };
    await resolveBaseline(broken, [{ name: "Secret Name", kind: "artist" }]);
    await scoreProof({ qloo: broken, signals, baseline: [], tasteforge: [{ name: "x", kind: "artist", qlooId: "MOCK-ARTIST-2" }] });
    await startBaseline(routedLlm({ baseline: new Error("llm down") }), qloo, { prompt: "p" });
    const text = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(text).toContain("search down");
    expect(text).toContain("insights down");
    expect(text).toContain("llm down");
    expect(text).not.toContain("Secret Name");
  });
});

describe("generateBrief", () => {
  const seeds = { seeds: [{ name: "Velvet Static", kind: "artist" }], tags: ["indie"] };
  const routes = (over: Routes = {}): Routes => ({
    seeds,
    critic: { followUps: [] },
    synthesis: (r) => draftFromPrompt(r.prompt),
    baseline: baselineReply,
    ...over,
  });
  async function gen(r: Routes, over = {}) {
    const events: AgentEvent[] = [];
    const result = await generateBrief({
      prompt: "cosy cafes",
      mode: "know_audience",
      city: "Brooklyn",
      llm: routedLlm(r),
      qloo,
      onEvent: (e) => events.push(e),
      ...over,
    });
    return { result, events };
  }

  it("emits the proof after the brief in the same stream", async () => {
    const { result, events } = await gen(routes());
    const types = events.map((e) => e.type);
    expect(types.indexOf("proof")).toBeGreaterThan(types.indexOf("brief"));
    expect(result.proof?.baselineNotFound).toBeGreaterThan(0);
    expect(result.proof?.tasteforgeAvg ?? 0).toBeGreaterThan(result.proof?.baselineAvg ?? 1);
    expect(events.filter((e) => e.type === "stage" && e.stage === "proof")).toHaveLength(2);
  });

  it("still returns the brief when the baseline or proof is unavailable", async () => {
    const down = await gen(routes({ baseline: new Error("x") }));
    expect(down.result.ok).toBe(true);
    expect(down.result.proof).toBeUndefined();
    // A missing proof always says why, in words the brief page can show.
    const reason = (events: typeof down.events) => events.flatMap((e) => (e.type === "stage" && e.stage === "proof" && e.detail?.startsWith("unavailable") ? [e.detail] : []));
    expect(reason(down.events)).toEqual(["unavailable: the plain-language answer to compare against could not be fetched (the model did not return picks in time)"]);
    const slow = await gen(routes({ baseline: () => new Promise(() => {}) }), { proofTimeoutMs: 20 });
    expect(slow.result.ok).toBe(true);
    expect(slow.result.proof).toBeUndefined();
    expect(reason(slow.events)).toEqual(["unavailable: the comparison did not finish in time (Qloo or the model was slow)"]);
  });

  it("does not start the baseline LLM call when the run stops to ask the user", async () => {
    const two = [
      { id: "MOCK-PLACE-1", name: "Paris", type: "urn:entity:place" },
      { id: "MOCK-MOVIE-1", name: "Paris", type: "urn:entity:movie" },
    ];
    const ambiguous: QlooClient = { ...qloo, search: async () => ({ data: two }) };
    const llm = routedLlm(routes({ seeds: { seeds: [{ name: "Paris", kind: "other" }], tags: [] } }));
    const result = await generateBrief({ prompt: "cosy cafes", mode: "know_audience", city: "Brooklyn", llm, qloo: ambiguous });
    expect(result.needsInput).toBeDefined();
    expect(llm.calls).toEqual(["seeds"]);
  });

  it("starts the baseline once the seeds have resolved", async () => {
    const llm = routedLlm(routes());
    await generateBrief({ prompt: "cosy cafes", mode: "know_audience", city: "Brooklyn", llm, qloo });
    expect(llm.calls).toContain("baseline");
  });

  it("skips the proof on request and on pipeline failure", async () => {
    const off = await gen(routes(), { withProof: false });
    expect(off.events.some((e) => e.type === "proof" || (e.type === "stage" && e.stage === "proof"))).toBe(false);
    const failed = await gen(routes({ seeds: new Error("x") }));
    expect(failed.result.ok).toBe(false);
    expect(failed.events.some((e) => e.type === "proof")).toBe(false);
  });
});
