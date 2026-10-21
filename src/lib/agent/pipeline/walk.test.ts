import { describe, expect, it } from "vitest";
import { createQlooClient } from "@/lib/qloo";
import { NO_EXCLUSIONS } from "../refine/plan";
import { createCtx } from "./context";
import { walkSections } from "./walk";

const qloo = createQlooClient({ mode: "mock", baseUrl: "https://hackathon.api.qloo.com" });
const signals = { entityIds: ["MOCK-ARTIST-1"], tagIds: [], entityNames: ["Velvet Static"], tagNames: [] };

async function heat(cellIds: readonly string[]) {
  const ctx = createCtx({ qloo, emit: () => undefined });
  await walkSections(ctx, ["where"], signals, "Brooklyn", { ...NO_EXCLUSIONS, cellIds });
  const record = ctx.box.ledger.records.find((r) => r.endpoint.includes("heatmap"));
  if (!record) throw new Error("no heatmap record");
  return record;
}

describe("walkSections hotspot exclusion", () => {
  it("rebuilds the summary (count and hottest names) after removing cells", async () => {
    const full = await heat([]);
    const [gone, ...rest] = full.entities ?? [];
    expect(rest.length).toBeGreaterThan(0);
    const trimmed = await heat([gone.id]);
    expect(trimmed.entities?.map((e) => e.id)).not.toContain(gone.id);
    expect(trimmed.summary).not.toContain(gone.name);
    expect(trimmed.summary).toContain(`hottest: ${rest.slice(0, 3).map((e) => e.name).join(", ")}`);
    const count = (s: string) => Number(/^(\d+) heatmap hotspots/.exec(s)?.[1]);
    expect(count(trimmed.summary)).toBe(count(full.summary) - 1);
  });

  it("reports no usable data when every hotspot is excluded", async () => {
    const full = await heat([]);
    const none = await heat((full.entities ?? []).map((e) => e.id));
    expect(none.summary).toMatch(/^No results/);
  });
});

describe("walkSections thin place results", () => {
  const venueSignals = { entityIds: [], tagIds: ["urn:tag:category:place:cafe", "urn:tag:genre:cozy"], entityNames: [], tagNames: ["cafe", "cozy"] };

  it("starts the widened query beside the venue-filtered one and uses it when the filtered answer is thin", async () => {
    const seen: { filtered: boolean; at: number }[] = [];
    const started = Date.now();
    const spy = {
      ...qloo,
      insights: async (p: Parameters<typeof qloo.insights>[0]) => {
        if (p.type !== "urn:entity:place") return qloo.insights(p);
        const filtered = (p.filterTags?.length ?? 0) > 0;
        seen.push({ filtered, at: Date.now() - started });
        if (filtered) {
          await new Promise((r) => setTimeout(r, 60));
          return { ...(await qloo.insights(p)), data: [] };
        }
        return qloo.insights(p);
      },
    };
    const ctx = createCtx({ qloo: spy, emit: () => undefined });
    await walkSections(ctx, ["aesthetic"], venueSignals, "Brooklyn", NO_EXCLUSIONS);
    const widened = seen.find((s) => !s.filtered && s.at < 50);
    expect(widened).toBeDefined();
    const places = ctx.box.ledger.records.filter((r) => r.params.type === "place");
    expect(places.some((r) => (r.entities?.length ?? 0) > 0)).toBe(true);
  });
});

describe("walkSections hotspot names", () => {
  const place = (id: string, name: string, lat: number, lon: number, address: string) => ({
    id,
    name,
    type: "urn:entity:place",
    affinity: 0.9,
    location: { latitude: lat, longitude: lon },
    properties: { address },
  });
  const places = [
    place("P1", "Sayaji", 22.7512, 75.8895, "H/1 Maguda Nagar, Vijay Nagar, Scheme No 54 Indore, Madhya Pradesh 452010 India"),
    place("P2", "Marriott", 22.7527, 75.8837, "H-2 Scheme No 54, Meghdoot Garden Vijay Nagar Indore, Madhya Pradesh 452010 India"),
    place("P3", "Malhar", 22.7445, 75.8943, "299A PO, Scheme No.54 Vijay Nagar Indore, Madhya Pradesh 452010 India"),
    place("P4", "Rajwada", 22.7184, 75.8552, "Rajwada Indore, Madhya Pradesh 452007 India"),
  ];
  const cells = [
    { geohash: "tsr1", latitude: 22.751, longitude: 75.889, affinity: 0.9 },
    { geohash: "tsr2", latitude: 22.6, longitude: 75.7, affinity: 0.7 },
  ];
  const withAddresses = {
    ...qloo,
    insights: async (p: Parameters<typeof qloo.insights>[0]) => (p.type === "urn:entity:place" ? { data: places } : qloo.insights(p)),
    heatmap: async () => ({ data: cells }),
  };

  it("names a hotspot from the addresses of the places around it, without asking a geocoder", async () => {
    let geocoderCalls = 0;
    const geocode = async () => {
      geocoderCalls += 1;
      return "Somewhere Else";
    };
    const ctx = createCtx({ qloo: withAddresses, emit: () => undefined, geocode });
    await walkSections(ctx, ["aesthetic", "where"], signals, "Indore", NO_EXCLUSIONS);
    const heat = ctx.box.ledger.records.find((r) => r.endpoint.includes("heatmap"));
    const names = (heat?.entities ?? []).map((e) => e.name);
    expect(names).toContain("Vijay Nagar");
    // the cell with no place near it falls back to the geocoder
    expect(names).toContain("Somewhere Else");
    expect(geocoderCalls).toBe(1);
  });

  it("keeps the placeholder for a hotspot nothing names (no geocoder in mock mode)", async () => {
    const ctx = createCtx({ qloo: withAddresses, emit: () => undefined });
    await walkSections(ctx, ["aesthetic", "where"], signals, "Indore", NO_EXCLUSIONS);
    const heat = ctx.box.ledger.records.find((r) => r.endpoint.includes("heatmap"));
    expect((heat?.entities ?? []).some((e) => e.name.startsWith("Area near"))).toBe(true);
  });
});
