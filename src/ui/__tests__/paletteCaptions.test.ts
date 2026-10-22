import { describe, expect, it } from "vitest";
import type { Evidence } from "../contract";
import { swatchCaptions } from "../paletteCaptions";

const record = (id: string, tags: [string, string][]): Evidence =>
  ({ id, endpoint: "/v2/insights", params: {}, summary: "s", tags: tags.map(([tid, name]) => ({ id: tid, name })) }) as Evidence;

const evidence = {
  ev_1: record("ev_1", [
    ["urn:tag:genre:music:jazz", "Jazz"],
    ["urn:tag:decor:historic", "Historic"],
    ["urn:tag:ambience:classic", "Classic"],
    ["urn:tag:cuisine:soul_food", "Soul Food"],
    ["urn:tag:decor:industrial", "Industrial"],
  ]),
};

describe("swatchCaptions", () => {
  it("prefers decor and ambience tags, at most two, over genre and cuisine", () => {
    const [caption] = swatchCaptions([{ tags: ["Jazz", "Soul Food", "Historic", "Classic"], evidence: ["ev_1"] }], evidence);
    expect(caption).toEqual(["Historic", "Classic"]);
  });

  it("falls back to the other tags when a swatch has no style tag", () => {
    expect(swatchCaptions([{ tags: ["Jazz", "Soul Food"], evidence: ["ev_1"] }], evidence)).toEqual([["Jazz", "Soul Food"]]);
  });

  it("never gives two swatches the same caption", () => {
    const same = { tags: ["Historic", "Classic", "Industrial"], evidence: ["ev_1"] };
    const captions = swatchCaptions([same, same], evidence).map((c) => c.join(", "));
    expect(captions[0]).toBe("Historic, Classic");
    expect(captions[1]).toBe("Industrial");
    expect(new Set(captions).size).toBe(2);
  });

  it("keeps a lone shared tag rather than leaving the swatch without a caption", () => {
    const same = { tags: ["Historic"], evidence: ["ev_1"] };
    expect(swatchCaptions([same, same], evidence)).toEqual([["Historic"], ["Historic"]]);
  });
});
