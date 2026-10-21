import { describe, expect, it } from "vitest";
import type { Brief } from "../contract";
import { diffBriefs } from "../briefChanges";
import {
  buildFeedback,
  canRefine,
  citedEvidence,
  countFeedback,
  itemKey,
  NO_FEEDBACK,
  pruneFeedback,
  toggleLock,
  toggleMark,
} from "../feedback";
import { sampleBrief, sampleEvidence } from "../fixtures/sampleBrief";
import { circleRadius, hotspotsFromBrief } from "../hotspots";
import { failStages, INITIAL_RUN, reduceEvent, startRefine, startRun, STAGES, type RunState } from "../runState";

const artist = sampleBrief.sound.artists[0];
const other = sampleBrief.sound.artists[1];
const artistKey = itemKey("sound.artists", artist);
const otherKey = itemKey("sound.artists", other);

describe("feedback marks", () => {
  it("toggles likes and dislikes, one mark per item", () => {
    const liked = toggleMark(NO_FEEDBACK, artistKey, "liked");
    expect(liked.marks[artistKey]).toBe("liked");
    expect(toggleMark(liked, artistKey, "disliked").marks[artistKey]).toBe("disliked");
    expect(toggleMark(liked, artistKey, "liked").marks[artistKey]).toBeUndefined();
    expect(NO_FEEDBACK.marks).toEqual({});
  });

  it("keeps lock and dislike mutually exclusive but lets like and lock coexist", () => {
    const locked = toggleLock(NO_FEEDBACK, artistKey);
    expect(toggleMark(locked, artistKey, "disliked").locked[artistKey]).toBeUndefined();
    const disliked = toggleMark(NO_FEEDBACK, artistKey, "disliked");
    expect(toggleLock(disliked, artistKey).marks[artistKey]).toBeUndefined();
    const both = toggleLock(toggleMark(NO_FEEDBACK, artistKey, "liked"), artistKey);
    expect(both.marks[artistKey]).toBe("liked");
    expect(both.locked[artistKey]).toBe(true);
    expect(toggleLock(both, artistKey).locked[artistKey]).toBeUndefined();
  });

  it("builds the request payload with Qloo ids (or labels) and item keys", () => {
    const state = toggleLock(toggleMark(toggleMark(NO_FEEDBACK, artistKey, "disliked"), otherKey, "liked"), itemKey("pairings", sampleBrief.pairings[0]));
    expect(buildFeedback(state)).toEqual({
      liked: [other.qlooId],
      disliked: [artist.qlooId],
      locked: [itemKey("pairings", sampleBrief.pairings[0])],
    });
    expect(countFeedback(state)).toEqual({ liked: 1, disliked: 1, locked: 1 });
    expect(canRefine(state)).toBe(true);
    expect(canRefine(toggleLock(NO_FEEDBACK, artistKey))).toBe(false);
  });

  it("prunes marks for items that left the brief", () => {
    const state = toggleMark(toggleMark(NO_FEEDBACK, artistKey, "disliked"), otherKey, "liked");
    const next: Brief = { ...sampleBrief, sound: { ...sampleBrief.sound, artists: [other] } };
    expect(pruneFeedback(state, next).marks).toEqual({ [otherKey]: "liked" });
  });

  it("sends only the evidence the brief cites", () => {
    const records = Object.fromEntries(sampleEvidence.map((e) => [e.id, e]));
    const ids = citedEvidence(sampleBrief, records).map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(["ev_1", "ev_2", "ev_3", "ev_4", "ev_5", "ev_6"]));
    expect(citedEvidence({ ...sampleBrief, messaging: { ...sampleBrief.messaging, evidence: [] } }, { ev_1: sampleEvidence[0] })).toHaveLength(1);
  });
});

describe("diffBriefs", () => {
  const swapped: Brief = {
    ...sampleBrief,
    sound: { ...sampleBrief.sound, artists: [{ label: "Phoebe Bridgers", evidence: ["ev_1"], qlooId: "ent_new" }, ...sampleBrief.sound.artists.slice(1)] },
  };

  it("lists what moved out and in, with the new item keys for the entrance animation", () => {
    const changes = diffBriefs(sampleBrief, swapped);
    expect(changes.added.map((a) => a.label)).toEqual(["Phoebe Bridgers"]);
    expect(changes.removed.map((a) => a.label)).toEqual(["Mitski"]);
    expect(changes.addedKeys).toEqual([itemKey("sound.artists", swapped.sound.artists[0])]);
    expect(changes.sections).toEqual(["sound"]);
    expect(changes.summary).toBe("Refreshed the sound. Out: Mitski. In: Phoebe Bridgers.");
  });

  it("says so when nothing changed and truncates long lists", () => {
    expect(diffBriefs(sampleBrief, sampleBrief).summary).toMatch(/^Nothing changed/);
    const many: Brief = {
      ...sampleBrief,
      pairings: ["a", "b", "c", "d", "e"].map((label) => ({ label, evidence: ["ev_1"] })),
    };
    expect(diffBriefs(sampleBrief, many).summary).toContain("In: a, b, c and 2 more.");
  });
});

describe("hotspots", () => {
  const evidence = {
    ev_h: {
      id: "ev_h",
      endpoint: "/v2/insights (urn:heatmap)",
      params: {},
      summary: "s",
      entities: [
        { id: "g1", name: "Vijay Nagar", affinity: 1, lat: 22.75, lon: 75.89 },
        { id: "g2", name: "Palasia", affinity: 0.6, lat: 22.72, lon: 75.88 },
        { id: "g3", name: "No coords", affinity: 0.5 },
      ],
    },
  };
  const brief: Brief = {
    ...sampleBrief,
    whereTheyAre: { city: "Indore", hotspots: [{ label: "Vijay Nagar", evidence: ["ev_h"], qlooId: "g1" }] },
  };

  it("reads named, located hotspots from the heatmap evidence and marks the listed ones", () => {
    const spots = hotspotsFromBrief(brief, evidence);
    expect(spots.map((s) => [s.name, s.listed])).toEqual([
      ["Vijay Nagar", true],
      ["Palasia", false],
    ]);
    expect(hotspotsFromBrief({ ...brief, whereTheyAre: undefined }, evidence)).toEqual([]);
    expect(hotspotsFromBrief(brief, {})).toEqual([]);
  });

  it("never maps a cell that has no name (its placeholder is raw coordinates)", () => {
    const withPlaceholder = { ev_h: { ...evidence.ev_h, entities: [...evidence.ev_h.entities, { id: "g4", name: "Area near 22.700, 75.800", affinity: 0.9, lat: 22.7, lon: 75.8 }] } };
    expect(hotspotsFromBrief(brief, withPlaceholder).map((s) => s.name)).toEqual(["Vijay Nagar", "Palasia"]);
  });

  it("scales the circle radius with affinity inside a bounded range", () => {
    expect(circleRadius(0)).toBe(9);
    expect(circleRadius(1)).toBe(30);
    expect(circleRadius(5)).toBe(30);
    expect(circleRadius(0.5)).toBeGreaterThan(circleRadius(0.2));
  });
});

describe("stage display on failure", () => {
  const statuses = (s: RunState["stages"]) => STAGES.map((st) => s[st.key].status);

  it("marks finished stages done, the running stage failed, and later stages skipped", () => {
    let state = startRun();
    state = reduceEvent(state, { type: "stage", stage: "seeds", status: "start" });
    state = reduceEvent(state, { type: "stage", stage: "seeds", status: "done" });
    state = reduceEvent(state, { type: "stage", stage: "resolve", status: "start" });
    state = reduceEvent(state, { type: "stage", stage: "resolve", status: "done" });
    state = reduceEvent(state, { type: "stage", stage: "walk", status: "start" });
    state = reduceEvent(state, { type: "error", message: "busy", retryable: true });
    expect(statuses(state.stages)).toEqual(["done", "done", "failed", "skipped", "skipped", "skipped"]);
    expect(state.phase).toBe("error");
  });

  it("fails the next stage when the error arrives between stages, and the first when nothing started", () => {
    const between = reduceEvent(reduceEvent(startRun(), { type: "stage", stage: "seeds", status: "start" }), { type: "stage", stage: "seeds", status: "done" });
    expect(statuses(failStages(between.stages))).toEqual(["done", "failed", "skipped", "skipped", "skipped", "skipped"]);
    expect(statuses(failStages(INITIAL_RUN.stages))[0]).toBe("failed");
  });

  it("treats a stream that ends without a brief as a failure of the running stage", () => {
    let state = reduceEvent(startRun(), { type: "stage", stage: "seeds", status: "start" });
    state = reduceEvent(state, { type: "done", ok: false });
    expect(state.phase).toBe("error");
    expect(state.stages.seeds.status).toBe("failed");
  });
});

describe("refine run state", () => {
  const request = { prompt: "p", mode: "know_audience" as const };
  const done = reduceEvent(startRun(request), {
    type: "brief",
    brief: sampleBrief,
    dropped: [],
    evidence: sampleEvidence,
    signals: { entityIds: ["e"], tagIds: [], entityNames: ["E"], tagNames: [] },
  });
  const swapped: Brief = {
    ...sampleBrief,
    sound: { ...sampleBrief.sound, artists: [{ label: "Phoebe Bridgers", evidence: ["ev_1"], qlooId: "ent_new" }, ...sampleBrief.sound.artists.slice(1)] },
  };

  it("keeps the brief on screen while refining, then records what changed", () => {
    expect(done.request).toEqual(request);
    expect(done.signals?.entityIds).toEqual(["e"]);
    const refining = startRefine(done);
    expect(refining.phase).toBe("done");
    expect(refining.brief).toBe(sampleBrief);
    expect(refining.refine).toEqual({ status: "running" });
    expect(refining.stages.seeds).toEqual({ status: "skipped", detail: "reused" });
    const walking = reduceEvent(refining, { type: "stage", stage: "walk", status: "start" });
    expect(walking.stages.walk.status).toBe("active");
    const refined = reduceEvent(walking, { type: "brief", brief: swapped, dropped: [], evidence: sampleEvidence });
    expect(refined.brief).toBe(swapped);
    expect(refined.refine).toBeUndefined();
    expect(refined.changes?.added.map((a) => a.label)).toEqual(["Phoebe Bridgers"]);
    expect(refined.signals?.entityIds).toEqual(["e"]);
  });

  it("keeps the old brief and reports a retryable error when the refine run fails", () => {
    const walking = reduceEvent(startRefine(done), { type: "stage", stage: "walk", status: "start" });
    const failed = reduceEvent(walking, { type: "error", message: "rate limit", retryable: true });
    expect(failed.phase).toBe("done");
    expect(failed.brief).toBe(sampleBrief);
    expect(failed.refine).toEqual({ status: "error", message: "rate limit", retryable: true });
    expect(failed.stages.walk.status).toBe("failed");
    expect(failed.stages.synthesis.status).toBe("skipped");
  });
});
