import { describe, expect, it } from "vitest";
import { createQlooClient } from "@/lib/qloo";
import type { GeoArea } from "@/lib/geo/nominatim";
import type { Evidence, EvidenceEntity } from "../ledger";
import { isUnnamedArea } from "../summaries";
import { createCtx, type PipelineCtx } from "./context";
import { finalizeHotspots, MAX_HOTSPOTS } from "./hotspots";

const qloo = createQlooClient({ mode: "mock", baseUrl: "https://hackathon.api.qloo.com" });

/** Ten unnamed Chicago cells as the heatmap draft leaves them: placeholder names, an offset note, no area name. */
const cells: EvidenceEntity[] = [
  [41.938, -87.688, "north-west of the Chicago centre, about 8 km out"],
  [41.931, -87.714, "north-west of the Chicago centre, about 9 km out"],
  [41.959, -87.744, "north-west of the Chicago centre, about 13 km out"],
  [41.889, -87.662, "north-west of the Chicago centre, about 3 km out"],
  [41.896, -87.703, "west of the Chicago centre, about 6 km out"],
  [41.8, -87.588, "south of the Chicago centre, about 9 km out"],
  [41.872, -87.626, "central Chicago"],
].map(([lat, lon, note], i) => ({ id: `cell${i}`, name: `Area near ${lat}, ${lon}`, affinity: 1 - i / 20, note: note as string, lat: lat as number, lon: lon as number }));

const heat = (entities: readonly EvidenceEntity[]): Evidence => ({
  id: "ev_heat",
  endpoint: "/v2/insights (urn:heatmap)",
  params: {},
  summary: `${entities.length} heatmap hotspots in Chicago; hottest: ${entities[0]?.name}`,
  entities,
});

const places: Evidence = {
  id: "ev_places",
  endpoint: "/v2/insights",
  params: { type: "place" },
  summary: "places",
  entities: [
    { id: "P1", name: "The Green Mill", affinity: 0.9, lat: 41.9686, lon: -87.6598 },
    { id: "P2", name: "Sleeping Village", affinity: 0.8, lat: 41.9392, lon: -87.7133 },
  ],
};

function ctxWith(records: Evidence[], geocode?: (lat: number, lon: number) => Promise<GeoArea | undefined>): PipelineCtx {
  const ctx = createCtx({ qloo, emit: () => undefined, ...(geocode ? { geocode } : {}) });
  ctx.box.ledger = { records };
  return ctx;
}

const heatNames = (ctx: PipelineCtx): string[] => (ctx.box.ledger.records.find((r) => r.endpoint.includes("heatmap"))?.entities ?? []).map((e) => e.name);

describe("finalizeHotspots", () => {
  it("keeps every in-city cell when nothing can name it: reference places and compass labels, never coordinates", async () => {
    const ctx = ctxWith([places, heat(cells)]);
    await finalizeHotspots(ctx, "Chicago", 0);
    const names = heatNames(ctx);
    expect(names).toHaveLength(MAX_HOTSPOTS);
    expect(names.some(isUnnamedArea)).toBe(false);
    expect(names).toContain("Near Sleeping Village");
    expect(names.some((n) => n.startsWith("North-west Chicago"))).toBe(true);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
  });

  it("is not held up by a geocoder that never answers: its own short budget ends and the cells are still labelled", async () => {
    const ctx = ctxWith([places, heat(cells)], () => new Promise<GeoArea | undefined>(() => undefined));
    const started = Date.now();
    await finalizeHotspots(ctx, "Chicago", 60);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(heatNames(ctx)).toHaveLength(MAX_HOTSPOTS);
  });

  it("treats a failing geocoder like no answer", async () => {
    const ctx = ctxWith([places, heat(cells)], async () => {
      throw new Error("429");
    });
    await finalizeHotspots(ctx, "Chicago", 60);
    expect(heatNames(ctx)).toHaveLength(MAX_HOTSPOTS);
  });

  it("uses the geocoder's name when it answers, and still drops a cell it positively places at an airport", async () => {
    const geocode = async (lat: number): Promise<GeoArea> => (lat === 41.938 ? { name: "O'Hare Airport", residential: false } : { name: `District ${lat}`, residential: true });
    const ctx = ctxWith([heat(cells)], geocode);
    await finalizeHotspots(ctx, "Chicago", 2_000);
    const names = heatNames(ctx);
    expect(names).toHaveLength(MAX_HOTSPOTS);
    expect(names.some((n) => n.startsWith("District"))).toBe(true);
    expect(names.join()).not.toContain("O'Hare");
    expect((ctx.box.ledger.records[0].entities ?? []).map((e) => e.id)).not.toContain("cell0");
  });

  it("leaves a heatmap without a city alone", async () => {
    const ctx = ctxWith([heat(cells)]);
    await finalizeHotspots(ctx, undefined, 0);
    expect(heatNames(ctx).every(isUnnamedArea)).toBe(true);
  });
});
