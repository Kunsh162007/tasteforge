import { describe, expect, it } from "vitest";
import { demographicsDraft, heatmapDraft, trendingDraft } from "./summaries";

const base = { endpoint: "/x", params: {} };
const none = { data: [], warning: "nothing here" };

describe("summaries", () => {
  it("describes empty results with the client warning, or a default hint", () => {
    expect(demographicsDraft(base, none).summary).toBe("No results. nothing here");
    expect(heatmapDraft(base, { data: [] }, "Paris").summary).toMatch(/^No results\. Try broader/);
    expect(trendingDraft(base, none).summary).toMatch(/^No results/);
  });

  it("summarises demographics, heatmap hotspots and trend direction", () => {
    const demo = demographicsDraft(base, {
      data: [{ entityId: "e", age: { "25-34": 0.5, "35-44": 0.2 }, gender: { female: 0.6, male: 0.4 } }],
    });
    expect(demo.summary).toBe("Audience over-indexes (vs general population) on age: 25-34 +50%, 35-44 +20%; gender: female +60%, male +40%");

    const heat = heatmapDraft(
      base,
      { data: [{ geohash: "a", latitude: 1, longitude: 2, affinity: 0.2 }, { geohash: "b", latitude: 3, longitude: 4, affinity: 0.9 }] },
      "Paris",
    );
    expect(heat.entities?.[0]).toMatchObject({ id: "b", name: "Area near 3.000, 4.000", affinity: 0.9, lat: 3, lon: 4 });

    const named = heatmapDraft(base, { data: [{ geohash: "a", name: "Vijay Nagar", latitude: 22.75, longitude: 75.89, affinity: 0.9 }] }, "Indore");
    expect(named.entities?.[0].name).toBe("Vijay Nagar");
    expect(named.summary).toContain("hottest: Vijay Nagar");

    const skew = demographicsDraft(base, { data: [{ entityId: "e", age: { "25-34": -0.3 }, gender: { male: 0.1 } }] });
    expect(skew.summary).toContain("age: no clear skew; gender: male +10%");

    // Qloo ranks popularity (1 is best), so a falling rank number is a rising artist.
    const point = (date: string, populationRank: number) => ({ date, populationRank });
    expect(trendingDraft(base, { data: [point("2026-02-01", 40), point("2026-01-01", 90)] }).summary).toMatch(/rising, now rank 40/);
    expect(trendingDraft(base, { data: [point("2026-02-01", 90), point("2026-01-01", 40)] }).summary).toMatch(/falling/);
    expect(trendingDraft(base, { data: [{ date: "2026-01-01" }] }).summary).toMatch(/flat/);
  });
});
