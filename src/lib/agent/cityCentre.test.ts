import { describe, expect, it, vi } from "vitest";
import { createCentreResolver, knownCentre, radiusFromSpanKm } from "./cityCentre";

describe("knownCentre", () => {
  it("maps New York to the city, not the state, and sizes the reach by the city", () => {
    expect(knownCentre("New York")).toMatchObject({ lat: 40.7128, radiusKm: 25 });
    expect(knownCentre("new york, NY")?.lat).toBe(40.7128);
    expect(knownCentre("Indore")?.radiusKm).toBeLessThan(knownCentre("London")?.radiusKm ?? 0);
  });

  it("ignores accents and case and returns nothing for an unknown town", () => {
    expect(knownCentre("PARIS")?.lat).toBeCloseTo(48.86, 1);
    expect(knownCentre("Springfield")).toBeUndefined();
  });
});

describe("radiusFromSpanKm", () => {
  it("stays between 8 and 25 km", () => {
    expect(radiusFromSpanKm(4)).toBe(8);
    expect(radiusFromSpanKm(30)).toBe(23);
    expect(radiusFromSpanKm(200)).toBe(25);
    expect(radiusFromSpanKm(Number.NaN)).toBe(18);
  });
});

describe("createCentreResolver", () => {
  it("answers from the table without a lookup, and looks up an unknown city once", async () => {
    const lookup = vi.fn(async () => ({ lat: 1, lon: 2, radiusKm: 10 }));
    const resolve = createCentreResolver(lookup);
    expect((await resolve("Chicago"))?.lat).toBeCloseTo(41.88, 1);
    expect(lookup).not.toHaveBeenCalled();
    await resolve("Springfield");
    await resolve("springfield");
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("returns undefined when there is no lookup or it fails", async () => {
    expect(await createCentreResolver()("Springfield")).toBeUndefined();
    expect(await createCentreResolver(async () => Promise.reject(new Error("down")))("Springfield")).toBeUndefined();
  });
});

describe("knownCentre regions and boroughs", () => {
  it("gives Brooklyn its own centre however the request spells it, not Manhattan's or the whole city's", () => {
    for (const spelling of ["Brooklyn", "Brooklyn, New York", "Brooklyn NY", "brooklyn new york usa"]) {
      expect(knownCentre(spelling)).toMatchObject({ lat: 40.6501, radiusKm: 12 });
    }
    expect(knownCentre("Paris, France")?.radiusKm).toBe(15);
    expect(knownCentre("Paris France")?.lat).toBeCloseTo(48.86, 1);
  });

  it("does not mistake another place for a known one just because it starts with the same word", () => {
    expect(knownCentre("Portland Maine")).toBeUndefined();
    expect(knownCentre("York")).toBeUndefined();
  });
});
