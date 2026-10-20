import { describe, expect, it } from "vitest";
import { sampleBrief } from "../fixtures/sampleBrief";
import { diffCities } from "../compareBriefs";
import type { Brief } from "../contract";

const withCity = (b: Brief, hotspots: string[], over: Partial<Brief> = {}): Brief => ({
  ...b,
  whereTheyAre: { city: "London", hotspots: hotspots.map((label) => ({ label, evidence: ["ev_5"] })) },
  ...over,
});

const slot = (res: ReturnType<typeof diffCities>, key: string) => {
  const found = res.slots.find((s) => s.key === key);
  if (!found) throw new Error(`no slot ${key}`);
  return found;
};

describe("diffCities", () => {
  it("treats identical briefs as fully shared", () => {
    const res = diffCities(sampleBrief, sampleBrief);
    expect(res.differing).toBe(0);
    expect(res.shared).toBeGreaterThan(0);
    expect(slot(res, "artists").onlyA).toEqual([]);
  });

  it("splits hotspots into shared and city-specific", () => {
    const b = withCity(sampleBrief, ["Shoreditch", "greenpoint", "Hackney"]);
    const hot = slot(diffCities(sampleBrief, b), "hotspots");
    expect(hot.shared.map((p) => p.a.label)).toEqual(["Greenpoint"]);
    expect(hot.onlyA.map((i) => i.label)).toEqual(["Williamsburg", "Bed-Stuy"]);
    expect(hot.onlyB.map((i) => i.label)).toEqual(["Shoreditch", "Hackney"]);
  });

  it("matches artists ignoring case, punctuation and a parenthetical type", () => {
    const b: Brief = { ...sampleBrief, sound: { ...sampleBrief.sound, artists: [{ label: "mitski (band)", evidence: ["ev_1"] }, { label: "Other", evidence: ["ev_1"] }] } };
    const art = slot(diffCities(sampleBrief, b), "artists");
    expect(art.shared).toHaveLength(1);
    expect(art.onlyB.map((i) => i.label)).toEqual(["Other"]);
  });

  it("matches by Qloo id when labels differ", () => {
    const b: Brief = { ...sampleBrief, sound: { ...sampleBrief.sound, artists: [{ label: "M. Miyawaki", qlooId: "ent_a1", evidence: ["ev_1"] }] } };
    expect(slot(diffCities(sampleBrief, b), "artists").shared).toHaveLength(1);
  });

  it("treats near-identical palette colours as shared even with different names", () => {
    const [first, ...rest] = sampleBrief.aesthetic.palette;
    const b: Brief = {
      ...sampleBrief,
      aesthetic: { ...sampleBrief.aesthetic, palette: [{ ...first, label: "Honey lamp", hex: "#C98C40" }, { ...rest[0], label: "Deep violet", hex: "#4B1E8A" }] },
    };
    const pal = slot(diffCities(sampleBrief, b), "palette");
    expect(pal.shared.map((p) => p.a.label)).toEqual([first.label]);
    expect(pal.onlyB.map((i) => i.label)).toEqual(["Deep violet"]);
  });

  it("copes with a city that has no places or hotspots", () => {
    const b: Brief = { ...sampleBrief, whereTheyAre: undefined, aesthetic: { ...sampleBrief.aesthetic, referencePlaces: [] } };
    const res = diffCities(sampleBrief, b);
    expect(slot(res, "hotspots").onlyA.length).toBeGreaterThan(0);
    expect(slot(res, "places").onlyB).toEqual([]);
  });

  it("uses each item only once", () => {
    const dup: Brief = { ...sampleBrief, sound: { ...sampleBrief.sound, artists: [{ label: "Mitski", evidence: ["ev_1"] }, { label: "Mitski", evidence: ["ev_1"] }] } };
    const art = slot(diffCities(dup, sampleBrief), "artists");
    expect(art.shared).toHaveLength(1);
    expect(art.onlyA).toHaveLength(1);
  });
});
