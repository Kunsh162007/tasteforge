import { describe, expect, it } from "vitest";
import { nameVariants, namesMatch, overlap, resolvePick, summarizeByKind, summarizeKind, type PickOutcome } from "./benchmark";

const anchor = { lat: 22.72, lon: 75.86 }; // Indore

describe("namesMatch", () => {
  it("ignores case, punctuation and parentheses", () => {
    expect(namesMatch("Blue Tokai", "blue tokai (indore)")).toBe(true);
  });

  it("accepts a name contained in a longer one on word boundaries only", () => {
    expect(namesMatch("Blue Tokai", "Blue Tokai Coffee Roasters")).toBe(true);
    expect(namesMatch("Cafe", "Cafe Coffee Day")).toBe(false);
    expect(namesMatch("Starbucks", "Star")).toBe(false);
    expect(namesMatch("", "x")).toBe(false);
  });
});

describe("resolvePick", () => {
  it("is not found when no hit carries the name", () => {
    expect(resolvePick("place", "Imaginary Cafe", [{ id: "a", name: "Chaayos" }], anchor)).toEqual({ found: false });
  });

  it("judges a place by the matching hit closest to the city", () => {
    const hits = [
      { id: "far", name: "Cafe Zoe", lat: 51.5, lon: -0.12 },
      { id: "near", name: "Cafe Zoe", lat: 22.73, lon: 75.87 },
    ];
    expect(resolvePick("place", "Cafe Zoe", hits, anchor)).toEqual({ found: true, qlooId: "near", offCity: false });
  });

  it("flags a place whose only match is in another city, and leaves coordinate-less matches unjudged", () => {
    expect(resolvePick("place", "Cafe Zoe", [{ id: "far", name: "Cafe Zoe", lat: 51.5, lon: -0.12 }], anchor).offCity).toBe(true);
    expect(resolvePick("place", "Cafe Zoe", [{ id: "x", name: "Cafe Zoe" }], anchor)).toEqual({ found: true, qlooId: "x" });
  });

  it("does not judge artists or brands by location", () => {
    expect(resolvePick("artist", "Prateek Kuhad", [{ id: "p", name: "Prateek Kuhad", lat: 1, lon: 1 }], anchor)).toEqual({ found: true, qlooId: "p" });
  });
});

describe("summaries", () => {
  const picks: PickOutcome[] = [
    { kind: "place", name: "a", found: true, offCity: false, affinity: 0.8 },
    { kind: "place", name: "b", found: true, offCity: true, affinity: 0.4 },
    { kind: "place", name: "c", found: false, affinity: null },
    { kind: "place", name: "d", found: true, affinity: null },
  ];

  it("counts not-found, off-city among located picks, and averages fit over found, scored picks", () => {
    const s = summarizeKind(picks);
    expect(s.notFoundRate).toBe(0.25);
    expect(s.located).toBe(2);
    expect(s.offCityRate).toBe(0.5);
    expect(s.unverifiedRate).toBe(0.5);
    expect(s.meanFit).toBeCloseTo(0.6);
    expect(s.scored).toBe(2);
  });

  it("returns null rates for empty lists", () => {
    const s = summarizeByKind([]);
    expect(s.artist.notFoundRate).toBeNull();
    expect(s.place.meanFit).toBeNull();
  });
});

describe("overlap", () => {
  it("is the Jaccard overlap of normalised names", () => {
    expect(overlap(["A b", "C"], ["a-b", "D"])).toBeCloseTo(1 / 3);
    expect(overlap(["x"], ["x"])).toBe(1);
    expect(overlap([], [])).toBeNull();
  });
});

describe("nameVariants", () => {
  it("adds the name without a city or neighbourhood tail", () => {
    expect(nameVariants("Coffee Culture, Indore")).toEqual(["Coffee Culture, Indore", "Coffee Culture"]);
    expect(nameVariants("Ozone Coffee Roasters – Shoreditch")).toEqual(["Ozone Coffee Roasters – Shoreditch", "Ozone Coffee Roasters"]);
    expect(nameVariants("The Roastery - Soho")[1]).toBe("The Roastery");
    expect(nameVariants("Blue Tokai")).toEqual(["Blue Tokai"]);
  });
});
