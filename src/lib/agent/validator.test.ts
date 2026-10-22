import { describe, expect, it } from "vitest";
import { addEvidence, EMPTY_LEDGER } from "./ledger";
import { item, makeDraft } from "./testing";
import { validateBrief } from "./validator";

const names = ["Fernwick Goods (brand)", "Real", "Mixed"];
const { ledger } = addEvidence(EMPTY_LEDGER, { endpoint: "/search", params: {}, summary: "s", entities: names.map((name, i) => ({ id: `e${i}`, name })) });
const { ledger: menuLedger } = addEvidence(EMPTY_LEDGER, {
  endpoint: "/v2/insights (urn:tag)",
  params: { tag_types: "urn:tag:genre:place:restaurant" },
  summary: "tags",
  tags: [
    { id: "t1", name: "Pizza" },
    { id: "t2", name: "Vietnamese" },
    { id: "t3", name: "Banh Mi" },
  ],
});

const brand = (label: string, id: string, evidence: string[] = ["ev_1"]) => ({ ...item(label, evidence), qlooId: id });

describe("validateBrief", () => {
  it("scores 1 and drops nothing when every item cites a real id", () => {
    const { brief, dropped } = validateBrief(makeDraft(["ev_1"], { pairings: [brand("Fernwick Goods (brand)", "e0")] }), "know_audience", ledger);
    expect(brief.groundingScore).toBe(1);
    expect(brief.mode).toBe("know_audience");
    expect(dropped).toEqual([]);
  });

  it("drops items with no evidence or unknown ids and lowers the score", () => {
    const draft = makeDraft(["ev_1"], {
      pairings: [item("Ghost brand", []), item("Fake cite", ["ev_99"]), brand("Real", "e1")],
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
    const draft = makeDraft(["ev_1"], { pairings: [brand("Mixed", "e2", ["ev_1", "ev_7"])] });
    const { brief, dropped } = validateBrief(draft, "know_audience", ledger);
    expect(brief.pairings[0].evidence).toEqual(["ev_1"]);
    expect(dropped).toEqual([]);
  });

  it("blanks ungrounded messaging", () => {
    const draft = makeDraft(["ev_1"], { pairings: [], messaging: { tone: "Loud", phrases: ["x"], evidence: ["ev_42"] } });
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

  it("removes menu ideas whose words appear in no tag, and says where a kept idea comes from", () => {
    const draft = makeDraft(["ev_1"], {
      pairings: [item("Post-Punk Pepperoni Pizza", ["ev_1"]), item("Banh Mi plate", ["ev_1"]), item("Pizza", ["ev_1"])],
    });
    const { brief, dropped } = validateBrief(draft, "know_audience", menuLedger);
    expect(brief.pairings.map((p) => p.label)).toEqual(["Banh Mi plate", "Pizza"]);
    expect(brief.pairings[0].detail).toBe("Creative suggestion from Qloo tags: Banh Mi.");
    expect(dropped).toEqual([{ section: "pairings", label: "Post-Punk Pepperoni Pizza", reason: "not_in_evidence", evidence: ["ev_1"] }]);
    expect(brief.groundingScore).toBeLessThan(1);
  });

  it("builds menu ideas only from food tags, never from music, audience or lifestyle tags", () => {
    const { ledger: mixed } = addEvidence(EMPTY_LEDGER, {
      endpoint: "/v2/insights (urn:tag)",
      params: {},
      summary: "tags",
      tags: [
        { id: "urn:tag:genre:music:jazz_hop", name: "Jazz - Hop" },
        { id: "urn:tag:customer_identity:jazz_enthusiasts", name: "Jazz Enthusiasts" },
        { id: "urn:tag:lifestyle:night_owls", name: "Night Owls" },
        { id: "urn:tag:cuisine:qloo:soul_food", name: "Soul Food" },
        { id: "urn:tag:specialty_dish:place:fried_chicken", name: "Fried Chicken" },
      ],
    });
    const draft = makeDraft(["ev_1"], {
      pairings: [item("Jazz Enthusiasts", ["ev_1"]), item("Night Owls plate", ["ev_1"]), item("Soul Food fried chicken", ["ev_1"])],
    });
    const { brief, dropped } = validateBrief(draft, "know_audience", mixed);
    expect(brief.pairings.map((p) => p.label)).toEqual(["Soul Food fried chicken"]);
    expect(dropped.map((d) => d.label)).toEqual(["Jazz Enthusiasts", "Night Owls plate"]);
  });

  it("drops every menu idea when the evidence has no food tags, keeping brand entities", () => {
    const { ledger: noFood } = addEvidence(EMPTY_LEDGER, {
      endpoint: "/v2/insights (urn:tag)",
      params: {},
      summary: "tags",
      tags: [{ id: "urn:tag:genre:music:jazz_hop", name: "Jazz - Hop" }],
      entities: [{ id: "b1", name: "Fernwick Goods" }],
    });
    const draft = makeDraft(["ev_1"], { pairings: [item("Jazz Hop special", ["ev_1"]), { ...item("Fernwick Goods", ["ev_1"]), qlooId: "b1" }] });
    const { brief } = validateBrief(draft, "know_audience", noFood);
    expect(brief.pairings.map((p) => p.label)).toEqual(["Fernwick Goods"]);
  });

  it("does not mutate the submitted draft", () => {
    const draft = makeDraft(["ev_1"], { pairings: [item("Ghost", [])] });
    const snapshot = JSON.stringify(draft);
    validateBrief(draft, "know_audience", ledger);
    expect(JSON.stringify(draft)).toBe(snapshot);
  });
});
