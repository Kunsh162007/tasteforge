import { describe, expect, it } from "vitest";
import { dedupeBrief } from "./dedupe";
import { item, makeDraft } from "./testing";
import { validateBrief } from "./validator";
import { addEvidence, EMPTY_LEDGER } from "./ledger";

const { ledger } = addEvidence(EMPTY_LEDGER, { endpoint: "/search", params: {}, summary: "s" });
const brief = (over: Parameters<typeof makeDraft>[1]) => validateBrief(makeDraft(["ev_1"], over), "know_audience", ledger).brief;

describe("dedupeBrief", () => {
  it("keeps one of two artists with the same Qloo id or the same name", () => {
    const b = brief({ sound: { direction: "x", artists: [{ ...item("Perfume Genius", ["ev_1"]), qlooId: "A1" }, { ...item("Beach House", ["ev_1"]), qlooId: "A2" }, { ...item("Perfume Genius", ["ev_1"]), qlooId: "A1" }, { ...item("perfume genius", ["ev_1"]), qlooId: "A9" }] } });
    expect(dedupeBrief(b).sound.artists.map((a) => a.label)).toEqual(["Perfume Genius", "Beach House"]);
  });

  it("compares names without accents, 'The' and punctuation", () => {
    const b = brief({ sound: { direction: "x", artists: [item("Sampha", ["ev_1"]), item("The Sampha", ["ev_1"])] } });
    expect(dedupeBrief(b).sound.artists).toHaveLength(1);
  });

  it("removes an entity that appears in two lists (the specific list keeps it: an artist stays in the sound)", () => {
    const b = brief({
      audienceProfile: { summary: "s", affinities: [{ ...item("Weyes Blood", ["ev_1"]), qlooId: "A3" }] },
      sound: { direction: "x", artists: [{ ...item("Weyes Blood", ["ev_1"]), qlooId: "A3" }, item("Sampha", ["ev_1"])] },
    });
    const out = dedupeBrief(b);
    expect(out.audienceProfile.affinities).toEqual([]);
    expect(out.sound.artists.map((a) => a.label)).toEqual(["Weyes Blood", "Sampha"]);
  });

  it("leaves a brief without repeats as it is", () => {
    const b = brief({});
    expect(dedupeBrief(b)).toEqual(b);
  });
});
