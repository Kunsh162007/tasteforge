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
