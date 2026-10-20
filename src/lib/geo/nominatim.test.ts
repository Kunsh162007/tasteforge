import { describe, expect, it, vi } from "vitest";
import { createNominatimGeocoder, pickAreaName } from "./nominatim";

const reply = (address: Record<string, string>, ok = true) =>
  ({ ok, json: async () => ({ address }) }) as unknown as Response;

describe("pickAreaName", () => {
  it("prefers the most local name and ignores empty addresses", () => {
    expect(pickAreaName({ city: "Indore", suburb: "Vijay Nagar", neighbourhood: "Scheme 54" })).toBe("Scheme 54");
    expect(pickAreaName({ city: "Indore", city_district: "Zone 2" })).toBe("Zone 2");
    expect(pickAreaName({ country: "India" })).toBeUndefined();
    expect(pickAreaName(undefined)).toBeUndefined();
  });
});

describe("createNominatimGeocoder", () => {
  const setup = (responses: Response[] | (() => Response) = [reply({ suburb: "Palasia" })]) => {
    const fetchImpl = vi.fn(async () => (typeof responses === "function" ? responses() : responses.shift() ?? reply({}))) as unknown as typeof fetch;
    let clock = 0;
    const sleeps: number[] = [];
    const geocode = createNominatimGeocoder({
      fetchImpl,
      userAgent: "TasteForgeTest/1.0",
      minIntervalMs: 1000,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });
    return { geocode, fetchImpl: fetchImpl as unknown as ReturnType<typeof vi.fn>, sleeps };
  };

  it("sends a reverse request with a proper User-Agent", async () => {
    const { geocode, fetchImpl } = setup();
    expect(await geocode(22.7244, 75.8839)).toBe("Palasia");
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://nominatim.openstreetmap.org/reverse?");
    expect(url).toContain("lat=22.7244");
    expect(url).toContain("zoom=14");
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe("TasteForgeTest/1.0");
  });

  it("clamps out-of-range coordinates and skips non-finite ones before calling Nominatim", async () => {
    const { geocode, fetchImpl } = setup(() => reply({ suburb: "X" }));
    await geocode(999, -999);
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain("lat=90&");
    expect(url).toContain("lon=-180&");
    expect(await geocode(Number.NaN, 1)).toBeUndefined();
    expect(await geocode(1, Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("spaces requests at least one interval apart", async () => {
    const { geocode, sleeps } = setup(() => reply({ suburb: "X" }));
    await Promise.all([geocode(1, 1), geocode(2, 2), geocode(3, 3)]);
    expect(sleeps).toEqual([1000, 1000]);
  });

  it("caches by rounded coordinates, including concurrent duplicates", async () => {
    const { geocode, fetchImpl } = setup(() => reply({ suburb: "X" }));
    await Promise.all([geocode(22.72441, 75.88391), geocode(22.72444, 75.88394)]);
    await geocode(22.7244, 75.8839);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns undefined on HTTP errors, network errors and unusable payloads, and does not cache them", async () => {
    const { geocode, fetchImpl } = setup([reply({}, false), reply({ country: "India" })]);
    expect(await geocode(1, 1)).toBeUndefined();
    expect(await geocode(1, 1)).toBeUndefined();
    fetchImpl.mockRejectedValueOnce(new Error("offline"));
    expect(await geocode(1, 1)).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
