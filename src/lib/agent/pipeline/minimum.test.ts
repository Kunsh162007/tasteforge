import { describe, expect, it } from "vitest";
import type { Brief } from "../brief";
import type { Evidence, Ledger } from "../ledger";
import { briefShortfalls, countContent, ledgerEntities, shortfalls } from "./minimum";

const ents = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i + 1}`, name: `${prefix} ${i + 1}`, affinity: 1 - i / 100 }));
const insights = (id: string, type: string, n: number, over: Partial<Evidence> = {}): Evidence => ({
  id,
  endpoint: "/v2/insights",
  params: { type },
  summary: n === 0 ? "No results. nothing" : `${n} results; top: x`,
  ...(n > 0 ? { entities: ents(type.toUpperCase(), n) } : {}),
  ...over,
});
const styleTags = (n: number): Evidence => ({
  id: "ev_9",
  endpoint: "/v2/insights (urn:tag)",
  params: { tag_types: "urn:tag:decor:qloo,urn:tag:ambience:qloo" },
  summary: `${n} tags; top: x`,
  tags: Array.from({ length: n }, (_, i) => ({ id: `urn:tag:decor:t${i}`, name: `Tag ${i}` })),
});
const ledger = (...records: Evidence[]): Ledger => ({ records });

describe("countContent", () => {
  it("counts distinct usable results per kind across records, ignoring failed or empty ones", () => {
    const l = ledger(insights("ev_1", "place", 3), insights("ev_2", "place", 5), insights("ev_3", "place", 0), insights("ev_4", "artist", 2), styleTags(4));
    expect(countContent(l, "place")).toBe(5);
    expect(countContent(l, "artist")).toBe(2);
    expect(countContent(l, "brand")).toBe(0);
    expect(countContent(l, "style")).toBe(4);
  });
});

describe("shortfalls", () => {
  const full = ledger(insights("ev_1", "place", 4), insights("ev_2", "artist", 5), insights("ev_3", "brand", 3), styleTags(3));

  it("reports nothing when every floor is met", () => {
    expect(shortfalls(full, "London")).toEqual([]);
  });

  it("names each kind that is short, with what it has and what it needs", () => {
    const thin = ledger(insights("ev_1", "place", 1), insights("ev_2", "artist", 6), insights("ev_3", "brand", 2));
    expect(shortfalls(thin, "London")).toEqual([
      { kind: "place", have: 1, need: 4 },
      { kind: "brand", have: 2, need: 3 },
      { kind: "style", have: 0, need: 3 },
    ]);
  });

  it("ignores place content when there is no city", () => {
    expect(shortfalls(ledger(insights("ev_2", "artist", 1)), undefined).map((s) => s.kind)).toEqual(["artist", "brand"]);
  });
});

describe("briefShortfalls", () => {
  const brief = (places: number, artists: number, brandIds: string[] = []) =>
    ({
      aesthetic: { referencePlaces: ents("PLACE", places).map((e) => ({ label: e.name, evidence: ["ev_1"], qlooId: e.id })) },
      sound: { artists: ents("ARTIST", artists).map((e) => ({ label: e.name, evidence: ["ev_2"], qlooId: e.id })) },
      pairings: [...brandIds.map((id) => ({ label: id, evidence: ["ev_3"], qlooId: id })), { label: "Bun maska", evidence: ["ev_3"] }],
    }) as unknown as Pick<Brief, "aesthetic" | "sound" | "pairings">;
  const l = ledger(insights("ev_1", "place", 8), insights("ev_2", "artist", 8), insights("ev_3", "brand", 4));

  it("flags a section the ledger could fill but the brief did not", () => {
    expect(briefShortfalls(brief(1, 5, ["BRAND-1", "BRAND-2", "BRAND-3"]), l, "London")).toEqual([{ kind: "place", have: 1, need: 4 }]);
  });

  it("counts only brand entities in pairings, not menu ideas", () => {
    expect(briefShortfalls(brief(4, 5, ["BRAND-1"]), l, "London")).toEqual([{ kind: "brand", have: 1, need: 3 }]);
  });

  it("does not ask for more than the ledger holds", () => {
    const small = ledger(insights("ev_1", "place", 2), insights("ev_2", "artist", 2), insights("ev_3", "brand", 1));
    expect(briefShortfalls(brief(2, 2, ["BRAND-1"]), small, "London")).toEqual([]);
  });
});

describe("ledgerEntities", () => {
  it("lists each entity once, in ledger order", () => {
    const l = ledger(insights("ev_1", "artist", 3), insights("ev_2", "artist", 4));
    expect(ledgerEntities(l, "artist").map((x) => x.entity.id)).toEqual(["ARTIST-1", "ARTIST-2", "ARTIST-3", "ARTIST-4"]);
    expect(ledgerEntities(l, "artist")[3].evidence).toBe("ev_2");
  });
});
