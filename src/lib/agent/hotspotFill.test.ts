import { describe, expect, it } from "vitest";
import { fillHotspots } from "./hotspotFill";
import type { Brief } from "./brief";
import { makeDraft } from "./testing";

const brief = (over: Partial<Brief> = {}): Brief => ({ ...makeDraft(["ev_1"]), mode: "know_audience", groundingScore: 1, ...over });
const ledger = {
  records: [
    {
      id: "ev_9",
      endpoint: "/v2/insights (urn:heatmap)",
      params: {},
      summary: "3 heatmap hotspots in Paris",
      entities: [
        { id: "g1", name: "1st Arrondissement", note: "west of the Paris centre, about 2 km out" },
        { id: "g2", name: "Area near 48.8, 2.3" },
        { id: "g3", name: "5th Arrondissement" },
      ],
    },
  ],
};

describe("fillHotspots", () => {
  it("lists the named cells from the evidence when the writer left the section out", () => {
    const out = fillHotspots(brief({ whereTheyAre: undefined }), ledger, "Paris");
    expect(out.whereTheyAre?.city).toBe("Paris");
    expect(out.whereTheyAre?.hotspots).toEqual([
      { label: "1st Arrondissement", detail: "west of the Paris centre, about 2 km out", evidence: ["ev_9"], qlooId: "g1" },
      { label: "5th Arrondissement", evidence: ["ev_9"], qlooId: "g3" },
    ]);
  });

  it("keeps hotspots the writer gave, and does nothing without a city or a heatmap", () => {
    const given = brief({ whereTheyAre: { city: "Paris", hotspots: [{ label: "Marais", evidence: ["ev_9"] }] } });
    expect(fillHotspots(given, ledger, "Paris")).toBe(given);
    const none = brief({ whereTheyAre: undefined });
    expect(fillHotspots(none, ledger, undefined)).toBe(none);
    expect(fillHotspots(none, { records: [] }, "Paris")).toBe(none);
  });
});
