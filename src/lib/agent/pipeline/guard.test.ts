import { describe, expect, it } from "vitest";
import type { Brief } from "../brief";
import type { EvidenceEntity } from "../ledger";
import { createGuard, dropSeedEchoes, keepAboveMedian, medianPoint, normalizeName, scrubEntities } from "./guard";

const e = (name: string, extra: Partial<EvidenceEntity> = {}): EvidenceEntity => ({ id: `id-${name}`, name, ...extra });
const at = (name: string, lat: number, lon: number): EvidenceEntity => e(name, { lat, lon });

const london = [at("A", 51.51, -0.12), at("B", 51.52, -0.13), at("C", 51.5, -0.1), at("Merci Paris", 48.86, 2.36)];

describe("normalizeName", () => {
  it("lowercases, strips accents-free punctuation and parentheses", () => {
    expect(normalizeName("  Radio-Head (band) ")).toBe("radio head");
    expect(normalizeName("A24")).toBe("a24");
  });
});

describe("scrubEntities", () => {
  it("removes the user's seeds by id and by normalized name", () => {
    const guard = createGuard({ entityIds: ["id-Radiohead"], entityNames: ["Radiohead", "A24"] });
    const out = scrubEntities([e("Radiohead", { id: "id-Radiohead" }), e("radiohead (band)", { id: "other" }), e("A24"), e("Beach House")], guard, false);
    expect(out.kept.map((x) => x.name)).toEqual(["Beach House"]);
    expect(out.removedSeeds).toBe(3);
  });

  it("drops places far outside the city cluster and remembers the anchor", () => {
    const guard = createGuard({ entityIds: [], entityNames: [] }, "London");
    const out = scrubEntities(london, guard, true);
    expect(out.kept.map((x) => x.name)).toEqual(["A", "B", "C"]);
    expect(out.removedOffCity).toBe(1);
    expect(guard.anchor).toBeDefined();
    const later = scrubEntities([at("D", 51.55, -0.2), at("Far", 40.7, -74)], guard, true);
    expect(later.kept.map((x) => x.name)).toEqual(["D"]);
  });

  it("keeps places without coordinates and skips the city check for non-place results", () => {
    const guard = createGuard({ entityIds: [], entityNames: [] }, "London");
    expect(scrubEntities([e("No coords"), ...london.slice(0, 3)], guard, true).kept).toHaveLength(4);
    expect(scrubEntities(london, createGuard({ entityIds: [], entityNames: [] }, "London"), false).kept).toHaveLength(4);
  });

  it("cannot judge fewer than three located places, so keeps them", () => {
    const guard = createGuard({ entityIds: [], entityNames: [] }, "London");
    expect(scrubEntities(london.slice(2), guard, true).kept).toHaveLength(2);
  });
});

describe("medianPoint and keepAboveMedian", () => {
  it("picks the most central located entity, ignoring far strays", () => {
    expect(medianPoint([at("a", 51.5, -0.1), at("b", 51.51, -0.12), at("c", 51.52, -0.11), at("far", 48.86, 2.36), at("far2", 48.87, 2.35)])).toMatchObject({ lat: expect.closeTo(51.5, 0) });
    expect(medianPoint([at("a", 1, 10)])).toBeUndefined();
  });

  it("keeps entities at or above the batch median affinity", () => {
    const list = [0.9, 0.86, 0.85, 0.8, 0.7].map((a, i) => e(`m${i}`, { affinity: a }));
    expect(keepAboveMedian(list).map((x) => x.name)).toEqual(["m0", "m1", "m2"]);
    expect(keepAboveMedian([e("x"), e("y")])).toHaveLength(2);
  });
});

describe("dropSeedEchoes", () => {
  const item = (label: string, qlooId?: string) => ({ label, evidence: ["ev_1"], ...(qlooId ? { qlooId } : {}) });
  const brief = {
    title: "t",
    mode: "know_audience",
    groundingScore: 1,
    audienceProfile: { summary: "s", affinities: [item("A24 films"), item("Frances Ha")] },
    aesthetic: { palette: [], lighting: [], materials: [], referencePlaces: [item("Cafe", "seed-place")] },
    sound: { direction: "d", artists: [item("Radiohead", "x"), item("Beach House")] },
    pairings: [item("A24"), item("MUBI")],
    messaging: { tone: "", phrases: [], evidence: [] },
  } as unknown as Brief;

  it("removes items that are the user's own seeds from every list", () => {
    const guard = createGuard({ entityIds: ["seed-place"], entityNames: ["Radiohead", "A24"] });
    const out = dropSeedEchoes(brief, guard);
    expect(out.sound.artists.map((a) => a.label)).toEqual(["Beach House"]);
    expect(out.pairings.map((p) => p.label)).toEqual(["MUBI"]);
    expect(out.aesthetic.referencePlaces).toEqual([]);
    expect(out.audienceProfile.affinities.map((a) => a.label)).toEqual(["A24 films", "Frances Ha"]);
  });
});
