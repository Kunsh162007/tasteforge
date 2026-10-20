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
