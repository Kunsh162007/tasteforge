import { describe, expect, it } from "vitest";
import { createQlooClient, type QlooClient, type QlooEntity } from "@/lib/qloo";
import { createCtx } from "./context";
import { resolveSeeds } from "./resolve";

const mock = createQlooClient({ mode: "mock", baseUrl: "https://hackathon.api.qloo.com" });
const ctxFor = (qloo: QlooClient) => createCtx({ qloo, emit: () => undefined });

const entity = (id: string, name: string, type = "urn:entity:artist"): QlooEntity => ({ id, name, type });

describe("resolveSeeds", () => {
  it("dedupes entities by id so names stay aligned with ids", async () => {
    const same: QlooClient = { ...mock, search: async () => ({ data: [entity("MOCK-ARTIST-1", "Radiohead")] }) };
    const plan = { seeds: [{ name: "Radiohead", kind: "artist" }, { name: "radio head", kind: "artist" }], tags: [] };
    const { signals } = await resolveSeeds(ctxFor(same), plan, []);
    expect(signals.entityIds).toEqual(["MOCK-ARTIST-1"]);
    expect(signals.entityNames).toEqual(["Radiohead"]);
  });

  it("collapses tags that share a name and keeps names aligned with ids", async () => {
    const tags: QlooClient = {
      ...mock,
      findTags: async () => ({
        data: [
          { id: "urn:tag:genre:media:indie", name: "Indie", type: "urn:tag:genre:media" },
          { id: "urn:tag:genre:place:indie", name: "Indie", type: "urn:tag:genre:place" },
        ],
      }),
    };
    const { signals } = await resolveSeeds(ctxFor(tags), { seeds: [], tags: ["indie"] }, []);
    expect(signals.tagIds).toEqual(["urn:tag:genre:media:indie"]);
    expect(signals.tagNames).toEqual(["Indie"]);
  });

  it("uses the ids the user chose even when the re-extracted seeds no longer match them", async () => {
    const two = [entity("MOCK-PLACE-1", "Paris", "urn:entity:place"), entity("MOCK-MOVIE-1", "Paris", "urn:entity:movie")];
    const ambiguous: QlooClient = { ...mock, search: async () => ({ data: two }) };
    const plan = { seeds: [{ name: "Paris", kind: "other" }], tags: [] };
    // The user picked an id that this round's search no longer returns.
    const res = await resolveSeeds(ctxFor(ambiguous), plan, ["MOCK-BRAND-77"]);
    expect(res.ambiguities).toEqual([]);
    expect(res.signals.entityIds[0]).toBe("MOCK-BRAND-77");
    expect(res.signals.entityNames).toHaveLength(res.signals.entityIds.length);
  });

  it("does not repeat the same chosen id when the search does return it", async () => {
    const two = [entity("MOCK-PLACE-1", "Paris", "urn:entity:place"), entity("MOCK-MOVIE-1", "Paris", "urn:entity:movie")];
    const ambiguous: QlooClient = { ...mock, search: async () => ({ data: two }) };
    const res = await resolveSeeds(ctxFor(ambiguous), { seeds: [{ name: "Paris", kind: "other" }], tags: [] }, ["MOCK-MOVIE-1"]);
    expect(res.signals.entityIds).toEqual(["MOCK-MOVIE-1"]);
    expect(res.signals.entityNames).toEqual(["Paris"]);
  });
});
