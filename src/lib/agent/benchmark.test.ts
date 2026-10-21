import { describe, expect, it } from "vitest";
import { auditKey, classifyMiss, missBreakdown, outcomeOf, overlap, summarizeByKind, summarizeKind, type PickOutcome } from "./benchmark";

const pick = (kind: PickOutcome["kind"], name: string, status: PickOutcome["status"], affinity: number | null = null): PickOutcome => ({ kind, name, status, affinity });

describe("summaries", () => {
  const picks: PickOutcome[] = [
    pick("place", "a", "verified", 0.8),
    pick("place", "b", "other_city", 0.4),
    pick("place", "c", "unverified"),
    pick("place", "d", "wrong_type"),
    pick("place", "e", "verified", 0.6),
  ];

  it("counts each status, the unverified share, and averages fit over verified, scored picks", () => {
    const s = summarizeKind(picks);
    expect(s).toMatchObject({ picks: 5, verified: 2, unverified: 1, wrongType: 1, otherCity: 1, couldntVerify: 3, scored: 2 });
    expect(s.couldntVerifyRate).toBeCloseTo(0.6);
    expect(s.meanFit).toBeCloseTo(0.7);
  });

  it("returns null rates for empty lists", () => {
    const s = summarizeByKind([]);
    expect(s.artist.couldntVerifyRate).toBeNull();
    expect(s.place.meanFit).toBeNull();
  });
});

describe("outcomeOf", () => {
  it("carries the verdict's id and matched type", () => {
    expect(outcomeOf("artist", "A24", { status: "wrong_type", matchedKind: "brand" })).toEqual({ kind: "artist", name: "A24", status: "wrong_type", matchedKind: "brand", affinity: null });
    expect(outcomeOf("place", "x", { status: "verified", qlooId: "q" }, 0.5)).toEqual({ kind: "place", name: "x", status: "verified", qlooId: "q", affinity: 0.5 });
  });
});

describe("classifying misses", () => {
  const audit = {
    [auditKey("place", "Sarafa Night Market")]: { class: "real_not_in_qloo" as const },
    [auditKey("place", "The Natural Wine Bar")]: { class: "likely_invented" as const },
  };

  it("takes wrong type and other city from the status, and the rest from the audit", () => {
    expect(classifyMiss(pick("artist", "Arundhati Roy", "wrong_type"), audit)).toBe("wrong_type");
    expect(classifyMiss(pick("place", "Kilo Vintage", "other_city"), audit)).toBe("real_other_city");
    expect(classifyMiss(pick("place", "Sarafa Night Market", "unverified"), audit)).toBe("real_not_in_qloo");
    expect(classifyMiss(pick("place", "Natural Wine Bar", "unverified"), audit)).toBe("likely_invented");
    expect(classifyMiss(pick("place", "Somewhere", "unverified"), audit)).toBe("unclassified");
    expect(classifyMiss(pick("place", "Fine", "verified"), audit)).toBeUndefined();
  });

  it("lets the audit correct a status (a namesake in another city is not the venue)", () => {
    expect(classifyMiss(pick("place", "Sarafa Night Market", "other_city"), audit)).toBe("real_not_in_qloo");
  });

  it("counts the classes", () => {
    const b = missBreakdown([pick("place", "Sarafa Night Market", "unverified"), pick("place", "Kilo", "other_city"), pick("place", "ok", "verified")], audit);
    expect(b).toEqual({ likely_invented: 0, real_not_in_qloo: 1, wrong_type: 0, real_other_city: 1, unclassified: 0 });
  });
});

describe("overlap", () => {
  it("is the Jaccard overlap of normalised names", () => {
    expect(overlap(["A b", "C"], ["a-b", "D"])).toBeCloseTo(1 / 3);
    expect(overlap(["x"], ["x"])).toBe(1);
    expect(overlap([], [])).toBeNull();
  });
});
