import { describe, expect, it } from "vitest";
import { createQlooClient, type QlooClient } from "@/lib/qloo";
import type { AgentEvent } from "../events";
import { countContent } from "./minimum";
import { draftFromPrompt, routedLlm, type Routes } from "../testing";
import { runPipeline } from "./index";

const mock = createQlooClient({ mode: "mock", baseUrl: "https://hackathon.api.qloo.com" });
const SEEDS = { seeds: [{ name: "Velvet Static", kind: "artist" }], tags: ["indie", "cosy cafes"], audienceHints: "Dreamy crowd" };

/** Qloo whose first, narrow place query (take below 20) finds one place; the broader queries find the usual ones. */
const thinPlaces: QlooClient = {
  ...mock,
  insights: async (p) => {
    const r = await mock.insights(p);
    return p.type === "urn:entity:place" && (p.take ?? 10) < 20 ? { ...r, data: r.data.slice(0, 1) } : r;
  },
};

async function run(routes: Routes, qloo: QlooClient) {
  const events: AgentEvent[] = [];
  const llm = routedLlm({ seeds: SEEDS, critic: { followUps: [] }, synthesis: (req) => draftFromPrompt(req.prompt), ...routes });
  const result = await runPipeline({ prompt: "Dream-pop fans who love cosy cafes", mode: "know_audience", city: "Brooklyn", llm, qloo, onEvent: (e) => events.push(e) });
  return { result, events, llm };
}

describe("minimum-content guard", () => {
  it("widens a thin places section before synthesis and records the extra results as evidence", async () => {
    const { result, events } = await run({}, thinPlaces);
    expect(result.ok).toBe(true);
    expect(countContent(result.ledger, "place")).toBeGreaterThanOrEqual(4);
    const widenCall = events.find((e) => e.type === "tool_call" && e.args.widened !== undefined && e.args.type === "place");
    expect(widenCall).toBeDefined();
    const done = events.find((e) => e.type === "stage" && e.stage === "critic" && e.status === "done");
    expect(done && done.type === "stage" ? done.detail : "").toContain("widened places");
    const places = result.ledger.records.flatMap((r) => (r.params.type === "place" ? (r.entities ?? []) : []));
    expect(new Set(places.map((e) => e.id)).size).toBe(places.length);
  });

  it("does nothing when every floor is met", async () => {
    const { events } = await run({}, mock);
    expect(events.some((e) => e.type === "tool_call" && e.args.widened !== undefined)).toBe(false);
  });

  it("fills the palette tags from the widened places when the first query had none to analyse", async () => {
    const none: QlooClient = { ...mock, insights: async (p) => (p.type === "urn:entity:place" && (p.take ?? 10) < 20 ? { ...(await mock.insights(p)), data: [] } : mock.insights(p)) };
    const { result } = await run({}, none);
    expect(countContent(result.ledger, "place")).toBeGreaterThanOrEqual(4);
    expect(countContent(result.ledger, "style")).toBeGreaterThan(0);
  });

  it("does not widen when the walk ran out of time", async () => {
    const slow: QlooClient = { ...mock, insights: (p) => (p.type === "urn:entity:place" ? new Promise(() => undefined) : mock.insights(p)) };
    const events: AgentEvent[] = [];
    const llm = routedLlm({ seeds: SEEDS, critic: { followUps: [] }, synthesis: (req) => draftFromPrompt(req.prompt) });
    await runPipeline({ prompt: "x cafes", mode: "know_audience", city: "Brooklyn", llm, qloo: slow, onEvent: (e) => events.push(e), timeoutMs: 1500 });
    expect(events.some((e) => e.type === "tool_call" && e.args.widened !== undefined)).toBe(false);
  });
});

describe("repair of a section the validator emptied", () => {
  /** A synthesis whose artists all cite an evidence id that does not exist, so the validator drops every one. */
  const uncitedArtists = (req: { prompt: string }) => {
    const draft = draftFromPrompt(req.prompt) as { sound: { artists: { evidence: string[] }[] } };
    return { ...draft, sound: { ...draft.sound, artists: draft.sound.artists.map((a) => ({ ...a, evidence: ["ev_9999"] })) } };
  };

  it("asks the model once for that section and keeps only items that are real ledger entities", async () => {
    const seen: string[] = [];
    const repair = (req: { prompt: string }) => {
      seen.push(req.prompt);
      const records = JSON.parse(req.prompt.split("\n").find((l) => l.startsWith("[{")) as string) as { evidence_id: string; entities?: { id: string; name: string }[] }[];
      const first = records.find((r) => (r.entities ?? []).some((e) => e.id.startsWith("MOCK-ARTIST")));
      const real = (first?.entities ?? []).slice(0, 2).map((e) => ({ label: e.name, qlooId: e.id, evidence: [first?.evidence_id] }));
      return { items: [...real, { label: "Invented Band", qlooId: "MOCK-ARTIST-INVENTED", evidence: [first?.evidence_id] }] };
    };
    const { result, llm } = await run({ synthesis: uncitedArtists, repair }, mock);
    expect(llm.calls.filter((c) => c === "repair")).toHaveLength(1);
    expect(seen[0]).toContain("artists");
    const artists = result.brief?.sound.artists ?? [];
    expect(artists.length).toBeGreaterThanOrEqual(2);
    expect(artists.map((a) => a.label)).not.toContain("Invented Band");
    expect(artists.every((a) => a.evidence.length > 0 && a.evidence.every((id) => result.ledger.records.some((r) => r.id === id)))).toBe(true);
  });

  it("falls back to the ledger's best-fit results when the repair call fails", async () => {
    const { result } = await run({ synthesis: uncitedArtists, repair: new Error("rate limited") }, mock);
    const artists = result.brief?.sound.artists ?? [];
    expect(artists.length).toBeGreaterThanOrEqual(4);
    expect(artists.every((a) => a.qlooId?.startsWith("MOCK-ARTIST"))).toBe(true);
  });

  it("makes no repair call when nothing was removed", async () => {
    const { llm } = await run({}, mock);
    expect(llm.calls).not.toContain("repair");
  });
});

describe("stable ordering of Qloo results", () => {
  it("records insights results by affinity, then id, whatever order Qloo returned them in", async () => {
    const shuffled: QlooClient = {
      ...mock,
      insights: async (p) => {
        const r = await mock.insights(p);
        return { ...r, data: [...r.data].reverse().map((e, i) => ({ ...e, affinity: i % 2 === 0 ? 0.5 : 0.9 })) };
      },
    };
    const { result } = await run({}, shuffled);
    const artists = result.ledger.records.find((r) => r.endpoint === "/v2/insights" && r.params.type === "artist")?.entities ?? [];
    expect(artists.length).toBeGreaterThan(2);
    const sorted = [...artists].sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0) || a.id.localeCompare(b.id));
    expect(artists.map((e) => e.id)).toEqual(sorted.map((e) => e.id));
  });
});

describe("repair of a section the writer left short", () => {
  it("fills an artists list of two from the ledger when the repair call fails", async () => {
    const twoArtists = (req: { prompt: string }) => {
      const draft = draftFromPrompt(req.prompt) as { sound: { artists: unknown[] } };
      return { ...draft, sound: { ...draft.sound, artists: draft.sound.artists.slice(0, 2) } };
    };
    const { result } = await run({ synthesis: twoArtists, repair: new Error("busy") }, mock);
    expect(result.brief?.sound.artists.length).toBeGreaterThanOrEqual(5);
    expect(new Set(result.brief?.sound.artists.map((a) => a.qlooId)).size).toBe(result.brief?.sound.artists.length);
  });
});
