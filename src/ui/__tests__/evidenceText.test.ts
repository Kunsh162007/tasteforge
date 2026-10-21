import { describe, expect, it } from "vitest";
import type { Evidence } from "../contract";
import { buildNameBook, isLocalRecord, joinNames, localCity, questionFor, rankingNote, readableParams, whySentence } from "../evidenceText";

const search: Evidence = { id: "ev_1", endpoint: "/search", params: { query: "Prateek Kuhad" }, summary: "", entities: [{ id: "A1", name: "Prateek Kuhad" }] };
const tags: Evidence = { id: "ev_2", endpoint: "/v2/tags", params: { query: "indie folk" }, summary: "", tags: [{ id: "T1", name: "Indie Folk" }] };
const artists: Evidence = {
  id: "ev_3",
  endpoint: "/v2/insights",
  params: { type: "artist", entity_ids: "A1", tag_ids: "T1", signal_location: "Indore" },
  summary: "",
  entities: [
    { id: "A2", name: "The Local Train", affinity: 0.97 },
    { id: "A3", name: "Anuv Jain", affinity: 0.97 },
    { id: "A4", name: "Ritviz", affinity: 0.97 },
  ],
};
const places: Evidence = {
  id: "ev_4",
  endpoint: "/v2/insights",
  params: { type: "place", entity_ids: "A1", location: "Indore" },
  summary: "",
  entities: [{ id: "P1", name: "Cafe Zoe", affinity: 0.91 }],
};
const book = buildNameBook([search, tags, artists, places]);

describe("evidence text", () => {
  it("names seeds and tags instead of ids", () => {
    expect(book.get("A1")).toBe("Prateek Kuhad");
    expect(book.get("T1")).toBe("Indie Folk");
  });

  it("ignores the placeholder for a user-picked entity", () => {
    const b = buildNameBook([], { entityIds: ["X"], entityNames: ["your pick"], tagIds: [], tagNames: [] });
    expect(b.has("X")).toBe(false);
  });

  it("asks the question in plain words", () => {
    expect(questionFor(places, book)).toBe("Places in Indore liked by people who like Prateek Kuhad");
    expect(questionFor(artists, book)).toBe("Artists liked by people who like Prateek Kuhad and Indie Folk, weighted toward Indore");
    expect(questionFor(search, book)).toBe("Which Qloo entity is “Prateek Kuhad”?");
    expect(questionFor({ ...places, endpoint: "/v2/insights (urn:heatmap)", params: { location: "Indore", entity_ids: "A1" } }, book)).toBe(
      "Where in Indore do people who like Prateek Kuhad concentrate?",
    );
    expect(questionFor({ ...places, params: { type: "brand" } }, book)).toBe("Brands liked by this audience");
  });

  it("explains a pick in one sentence with its affinity", () => {
    expect(whySentence("Cafe Zoe", [places], book)).toBe("Qloo: people who like Prateek Kuhad in Indore over-index on Cafe Zoe (affinity 0.91).");
    expect(whySentence("Nobody", [places], book)).toBeUndefined();
  });

  it("shows params with names where it can", () => {
    expect(readableParams(artists, book)).toContainEqual(["entity_ids", "Prateek Kuhad"]);
    expect(readableParams(artists, book)).toContainEqual(["signal_location", "Indore"]);
  });

  it("joins names", () => {
    expect(joinNames(["A", "B", "C"])).toBe("A, B and C");
    expect(joinNames(["A", "B", "C", "D", "E"])).toBe("A, B, C and 2 more");
    expect(joinNames([])).toBe("");
  });

  it("knows which records are localized and to where", () => {
    expect(isLocalRecord(artists)).toBe(true);
    expect(isLocalRecord(places)).toBe(false);
    expect(localCity(["ev_4", "ev_3"], { ev_3: artists, ev_4: places })).toBe("Indore");
    expect(localCity(["ev_4"], { ev_4: places })).toBeUndefined();
  });

  it("says when Qloo ranks everything equally, and stays quiet when scores differ", () => {
    const items = artists.entities!.map((e) => ({ qlooId: e.id, evidence: ["ev_3"] }));
    expect(rankingNote(items, { ev_3: artists })).toMatch(/all of these about the same \(0\.97\)/);
    const varied = { ...artists, entities: artists.entities!.map((e, i) => ({ ...e, affinity: 0.97 - i * 0.05 })) };
    expect(rankingNote(items, { ev_3: varied })).toBeUndefined();
    expect(rankingNote(items.slice(0, 2), { ev_3: artists })).toBeUndefined();
  });
});
