import { describe, expect, it } from "vitest";
import { addEvidence, compactEntities, compactTags, EMPTY_LEDGER, hasEvidence, toLlmView } from "./ledger";

describe("ledger", () => {
  it("appends immutably with sequential ids", () => {
    const a = addEvidence(EMPTY_LEDGER, { endpoint: "/search", params: { query: "x" }, summary: "one" });
    const b = addEvidence(a.ledger, { endpoint: "/v2/tags", params: {}, summary: "two" });
    expect(a.evidence.id).toBe("ev_1");
    expect(b.evidence.id).toBe("ev_2");
    expect(EMPTY_LEDGER.records).toHaveLength(0);
    expect(a.ledger.records).toHaveLength(1);
    expect(hasEvidence(b.ledger, "ev_2")).toBe(true);
    expect(hasEvidence(a.ledger, "ev_2")).toBe(false);
  });

  it("compacts to the limit and rounds affinity/score", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ id: `E${i}`, name: `n${i}`, affinity: 0.123456 }));
    const out = compactEntities(many);
    expect(out).toHaveLength(10);
    expect(out[0].affinity).toBe(0.12);
    expect(compactEntities([{ id: "a", name: "b" }])[0]).not.toHaveProperty("affinity");
    expect(compactTags([{ id: "t", name: "T", score: 0.987 }], 1)[0].score).toBe(0.99);
    expect(compactTags([{ id: "t", name: "T" }])[0]).not.toHaveProperty("score");
  });

  it("builds a compact LLM view with the evidence id", () => {
    const { evidence } = addEvidence(EMPTY_LEDGER, {
      endpoint: "/search",
      params: {},
      summary: "s",
      entities: [{ id: "E1", name: "N" }],
    });
    expect(toLlmView(evidence)).toEqual({ evidence_id: "ev_1", summary: "s", entities: [{ id: "E1", name: "N" }] });
    const bare = addEvidence(EMPTY_LEDGER, { endpoint: "/x", params: {}, summary: "y" }).evidence;
    expect(toLlmView(bare)).toEqual({ evidence_id: "ev_1", summary: "y" });
  });
});
