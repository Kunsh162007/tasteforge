import { describe, expect, it } from "vitest";
import type { Ledger } from "../ledger";
import { extractCues } from "./cues";

const ledger: Ledger = {
  records: [
    { id: "ev_1", endpoint: "/search", params: {}, summary: "", entities: [{ id: "p1", name: "Smoke House" }] },
    {
      id: "ev_2",
      endpoint: "/v2/insights (urn:tag)",
      params: {},
      summary: "",
      tags: [
        { id: "urn:tag:decor:qloo:industrial", name: "Industrial" },
        { id: "urn:tag:specialty_dish:place:buddy_s_burger", name: "Buddy's Burger" },
        { id: "urn:tag:cuisine:qloo:steak", name: "Steak" },
        { id: "urn:tag:specialty_dish:place:smoke_house", name: "Smoke House" },
      ],
    },
  ],
};

describe("extractCues", () => {
  it("never uses a place or entity name, or a possessive venue name, as a tag", () => {
    const names = extractCues(ledger, []).map((c) => c.name);
    expect(names).toContain("Industrial");
    expect(names).toContain("Steak");
    expect(names).not.toContain("Smoke House");
    expect(names).not.toContain("Buddy's Burger");
  });
});
