import { beforeAll, describe, expect, it } from "vitest";
import { createScriptedLlm } from "@/lib/llm";
import { createQlooClient } from "@/lib/qloo";
import type { Brief } from "../brief";
import { itemKey } from "../briefItems";
import type { AgentEvent, BriefSignals } from "../events";
import { generateBrief } from "../generate";
import type { Evidence } from "../ledger";
import { refineBrief, withLikedSignals } from ".";
import { buildPlan } from "./plan";
import { parseRefineRequest, type RefineRequest } from "./request";

const qloo = createQlooClient({ mode: "mock", baseUrl: "https://hackathon.api.qloo.com" });
const llm = createScriptedLlm();
const PROMPT = "A cafe for young professionals who love Radiohead, indie music and slow living.";

let brief: Brief;
let evidence: readonly Evidence[];
let signals: BriefSignals;

beforeAll(async () => {
  const r = await generateBrief({ prompt: PROMPT, mode: "know_audience", city: "Brooklyn", llm, qloo, allowNeedsInput: false, withProof: false });
  if (!r.brief || !r.signals) throw new Error("setup run failed");
  brief = r.brief;
  evidence = r.ledger.records;
  signals = r.signals;
});

const request = (feedback: Partial<RefineRequest["feedback"]>): RefineRequest => ({
  prompt: PROMPT,
  mode: "know_audience",
  city: "Brooklyn",
  brief,
  evidence,
  signals,
  feedback: { liked: [], disliked: [], locked: [], ...feedback },
});

async function refine(feedback: Partial<RefineRequest["feedback"]>, withProof = false) {
  const events: AgentEvent[] = [];
  const result = await refineBrief({ request: request(feedback), llm, qloo, withProof, onEvent: (e) => events.push(e) });
  return { result, events };
}

const calls = (events: AgentEvent[]) => events.flatMap((e) => (e.type === "tool_call" ? [e] : []));

describe("refineBrief", () => {
  it("replaces a disliked artist, keeps liked and locked ones verbatim, and leaves other sections untouched", async () => {
    const [a, b, c] = brief.sound.artists;
    const { result, events } = await refine({
      disliked: [a.qlooId!],
      liked: [b.qlooId!],
      locked: [itemKey("sound.artists", c)],
    });
    expect(result.ok).toBe(true);
    const next = result.brief!;
    const artists = next.sound.artists;
    expect(artists.map((x) => x.qlooId)).not.toContain(a.qlooId);
    expect(artists).toContainEqual(b);
    expect(artists).toContainEqual(c);
    expect(artists.length).toBe(brief.sound.artists.length);
    expect(next.pairings).toEqual(brief.pairings);
    expect(next.aesthetic).toEqual(brief.aesthetic);
    expect(next.audienceProfile).toEqual(brief.audienceProfile);
    expect(next.groundingScore).toBe(1);
    expect(next.mode).toBe("know_audience");

    // Only the sound section was re-walked: artist insights (with the exclusion and the liked signal) plus trending.
    const names = calls(events).map((e) => e.name);
    expect(names).toContain("qloo_trending");
    expect(names).not.toContain("qloo_heatmap");
    expect(names).not.toContain("qloo_demographics");
    const insights = calls(events).find((e) => e.name === "qloo_insights");
    expect(insights?.args).toMatchObject({ type: "artist", exclude_entity_ids: [a.qlooId] });
    expect(insights?.args.entity_ids).toEqual(expect.arrayContaining([b.qlooId!, ...signals.entityIds]));

    const stages = events.flatMap((e) => (e.type === "stage" ? [`${e.stage}:${e.status}`] : []));
    expect(stages).toEqual(["walk:start", "walk:done", "synthesis:start", "synthesis:done"]);
    expect(events.at(-1)).toMatchObject({ type: "brief" });
  });

  it("continues the old ledger numbering and the brief event carries the signals", async () => {
    const { events, result } = await refine({ disliked: [brief.sound.artists[0].qlooId!] });
    const event = events.find((e) => e.type === "brief");
    expect(event && event.type === "brief" ? event.signals?.entityIds : []).toEqual(expect.arrayContaining([...signals.entityIds]));
    const ids = result.ledger.records.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(evidence.length);
  });

  it("excludes disliked places and decor tags from the aesthetic walk", async () => {
    const place = brief.aesthetic.referencePlaces[0];
    const swatch = brief.aesthetic.palette[0];
    const { result, events } = await refine({ disliked: [place.qlooId!, swatch.qlooId ?? swatch.label] });
    const places = calls(events).find((e) => e.name === "qloo_insights" && e.args.type === "place");
    expect(places?.args.exclude_entity_ids).toEqual([place.qlooId]);
    expect(places?.args.exclude_tag_ids).toEqual([swatch.qlooId]);
    expect(result.brief!.aesthetic.referencePlaces.map((p) => p.qlooId)).not.toContain(place.qlooId);
    expect(result.brief!.aesthetic.palette.map((p) => p.label)).not.toContain(swatch.label);
    expect(result.brief!.sound).toEqual(brief.sound);
  });

  it("drops a disliked hotspot from the re-walked map data", async () => {
    const spot = brief.whereTheyAre!.hotspots[0];
    const { result } = await refine({ disliked: [spot.qlooId!] });
    expect(result.brief!.whereTheyAre!.hotspots.map((h) => h.qlooId)).not.toContain(spot.qlooId);
  });

  it("does not touch a locked item even if it is also disliked", async () => {
    const a = brief.sound.artists[0];
    const { result } = await refine({ disliked: [a.qlooId!, brief.sound.artists[1].qlooId!], locked: [itemKey("sound.artists", a)] });
    expect(result.brief!.sound.artists).toContainEqual(a);
  });

  it("with only likes, refreshes the sections of liked items around them", () => {
    const a = brief.sound.artists[0];
    const plan = buildPlan(brief, evidence, request({ liked: [a.qlooId!] }).feedback);
    expect(plan.sections).toEqual(["sound"]);
    expect(plan.likedEntityIds).toEqual([a.qlooId]);
  });

  it("re-runs the Taste Proof", async () => {
    const { result, events } = await refine({ disliked: [brief.sound.artists[0].qlooId!] }, true);
    expect(result.proof).toBeDefined();
    expect(events.some((e) => e.type === "proof")).toBe(true);
    expect(events.flatMap((e) => (e.type === "stage" ? [e.stage] : []))).toContain("proof");
  });

  it("fails calmly when none of the marked items are in the brief", async () => {
    const { result, events } = await refine({ disliked: ["not-in-this-brief"] });
    expect(result.ok).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: "error", retryable: false });
  });

  it("re-derives signals from the prompt when the client did not send them", async () => {
    const events: AgentEvent[] = [];
    const result = await refineBrief({
      request: { ...request({ disliked: [brief.sound.artists[0].qlooId!] }), signals: undefined },
      llm,
      qloo,
      withProof: false,
      onEvent: (e) => events.push(e),
    });
    expect(result.ok).toBe(true);
    expect(calls(events).some((e) => e.name === "qloo_search")).toBe(true);
  });
});

describe("withLikedSignals", () => {
  const plan = (likedEntityIds: string[], likedTagIds: string[] = []) =>
    ({ likedEntityIds, likedTagIds }) as unknown as Parameters<typeof withLikedSignals>[1];

  it("appends liked ids and keeps each name next to its own id", () => {
    const base = { entityIds: ["MOCK-ARTIST-1", "MOCK-ARTIST-2"], tagIds: ["urn:tag:a"], entityNames: ["One", "Two"], tagNames: ["A"] };
    const out = withLikedSignals(base, plan(["MOCK-ARTIST-3", "MOCK-ARTIST-1"]));
    expect(out.entityIds).toEqual(["MOCK-ARTIST-1", "MOCK-ARTIST-2", "MOCK-ARTIST-3"]);
    expect(out.entityNames).toEqual(["One", "Two"]);
    expect(out.tagNames).toEqual(["A"]);
  });

  it("drops names of ids cut by the cap without shifting the others", () => {
    const ids = Array.from({ length: 8 }, (_, i) => `MOCK-ARTIST-${i}`);
    const base = { entityIds: ids, tagIds: [], entityNames: ids.map((_, i) => `Name ${i}`), tagNames: [] };
    const out = withLikedSignals(base, plan(["MOCK-ARTIST-9"]));
    expect(out.entityIds).toEqual(ids);
    expect(out.entityNames).toEqual(base.entityNames);
  });

  it("ignores names it cannot trust when the base lists are not parallel", () => {
    const base = { entityIds: ["MOCK-ARTIST-1", "MOCK-ARTIST-2"], tagIds: [], entityNames: ["Only one"], tagNames: [] };
    expect(withLikedSignals(base, plan([])).entityNames).toEqual([]);
  });
});

describe("parseRefineRequest", () => {
  it("accepts a well-formed body and requires at least one liked or disliked item", () => {
    const body = { ...request({ disliked: ["x"] }) };
    expect(parseRefineRequest(body).ok).toBe(true);
    const none = parseRefineRequest({ ...body, feedback: { liked: [], disliked: [], locked: ["sound.artists|x"] } });
    expect(none).toMatchObject({ ok: false });
  });

  it("rejects signal ids that are not Qloo ids (commas, free text)", () => {
    const body = request({ disliked: ["x"] });
    for (const bad of ["a,b", "ignore previous instructions", "urn:tag:x,y"]) {
      expect(parseRefineRequest({ ...body, signals: { ...signals, entityIds: [bad] } }).ok).toBe(false);
      expect(parseRefineRequest({ ...body, signals: { ...signals, tagIds: [bad] } }).ok).toBe(false);
    }
  });

  it("rejects malformed bodies without echoing them", () => {
    const r = parseRefineRequest({ prompt: "SECRET", mode: "nope" });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("SECRET");
    expect(parseRefineRequest({ ...request({ disliked: ["x"] }), evidence: [{ id: "bad" }] }).ok).toBe(false);
  });
});
