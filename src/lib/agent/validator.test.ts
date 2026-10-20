import { describe, expect, it } from "vitest";
import { addEvidence, EMPTY_LEDGER } from "./ledger";
import { item, makeDraft } from "./testing";
import { validateBrief } from "./validator";

const { ledger } = addEvidence(EMPTY_LEDGER, { endpoint: "/search", params: {}, summary: "s" });

describe("validateBrief", () => {
  it("scores 1 and drops nothing when every item cites a real id", () => {
    const { brief, dropped } = validateBrief(makeDraft(["ev_1"]), "know_audience", ledger);
    expect(brief.groundingScore).toBe(1);
    expect(brief.mode).toBe("know_audience");
    expect(dropped).toEqual([]);
  });

  it("drops items with no evidence or unknown ids and lowers the score", () => {
    const draft = makeDraft(["ev_1"], {
      pairings: [item("Ghost brand", []), item("Fake cite", ["ev_99"]), item("Real", ["ev_1"])],
    });
    const { brief, dropped } = validateBrief(draft, "find_audience", ledger);
    expect(brief.pairings.map((p) => p.label)).toEqual(["Real"]);
    expect(dropped).toEqual([
      { section: "pairings", label: "Ghost brand", reason: "no_evidence", evidence: [] },
      { section: "pairings", label: "Fake cite", reason: "unknown_evidence", evidence: ["ev_99"] },
    ]);
    // 10 grounded of 12 submitted
    expect(brief.groundingScore).toBe(0.83);
  });

  it("trims invalid ids from items that keep at least one valid id", () => {
    const draft = makeDraft(["ev_1"], { pairings: [item("Mixed", ["ev_1", "ev_7"])] });
    const { brief, dropped } = validateBrief(draft, "know_audience", ledger);
    expect(brief.pairings[0].evidence).toEqual(["ev_1"]);
    expect(dropped).toEqual([]);
  });

  it("blanks ungrounded messaging", () => {
    const draft = makeDraft(["ev_1"], { messaging: { tone: "Loud", phrases: ["x"], evidence: ["ev_42"] } });
    const { brief, dropped } = validateBrief(draft, "know_audience", ledger);
    expect(brief.messaging).toEqual({ tone: "", phrases: [], evidence: [] });
    expect(dropped[0]).toMatchObject({ section: "messaging", reason: "unknown_evidence" });
  });

  it("scores 0 for an empty brief and skips empty messaging", () => {
    const empty = makeDraft([], {
      audienceProfile: { summary: "", affinities: [] },
      aesthetic: { palette: [], lighting: [], materials: [], referencePlaces: [] },
      sound: { direction: "", artists: [] },
      pairings: [],
      whereTheyAre: undefined,
      messaging: { tone: "", phrases: [], evidence: [] },
    });
    const { brief, dropped } = validateBrief(empty, "know_audience", ledger);
    expect(brief.groundingScore).toBe(0);
    expect(dropped).toEqual([]);
  });

  it("does not mutate the submitted draft", () => {
    const draft = makeDraft(["ev_1"], { pairings: [item("Ghost", [])] });
    const snapshot = JSON.stringify(draft);
    validateBrief(draft, "know_audience", ledger);
    expect(JSON.stringify(draft)).toBe(snapshot);
  });
});
