import { describe, expect, it } from "vitest";
import type { QlooClient } from "@/lib/qloo";
import { classifyHits, namesMatch, nameTokens, nameVariants, searchQueries, statusLabel, verifyPick, type VerifyHit } from "./verify";

const CHICAGO = { lat: 41.88, lon: -87.63 };
const hit = (id: string, name: string, kinds: string[], at?: [number, number]): VerifyHit => ({ id, name, kinds, ...(at ? { lat: at[0], lon: at[1] } : {}) });

describe("nameTokens and namesMatch", () => {
  it("ignores accents, 'The', articles and punctuation", () => {
    expect(nameTokens("Le Café de Flore")).toEqual(["flore"]);
    expect(namesMatch("Le Café de Flore", "Café de Flore")).toBe(true);
    expect(namesMatch("The Green Mill", "Green Mill")).toBe(true);
    expect(namesMatch("Bucket O' Blood", "Bucket O Blood")).toBe(true);
    expect(namesMatch("Bosé", "Bose")).toBe(true);
  });

  it("ignores descriptors like Cafe, Bar, Lounge and a branch suffix", () => {
    expect(namesMatch("The Green Mill Cocktail Lounge", "The Green Mill")).toBe(true);
    expect(namesMatch("Blue Tokai Coffee Roasters", "Blue Tokai Coffee Roasters | Bandra")).toBe(true);
    expect(namesMatch("Blue Tokai", "Blue Tokai Coffee Roasters | Hauz Khas")).toBe(true);
  });

  it("accepts a multi-word name contained in a longer one, but not a single shared word", () => {
    expect(namesMatch("Music Box Theatre", "Music Box Theatre Chicago")).toBe(true);
    expect(namesMatch("Brooklyn Museum", "Brooklyn Children's Museum")).toBe(false);
    expect(namesMatch("Amul", "Amul Foodland")).toBe(false);
    expect(namesMatch("Starbucks", "Star")).toBe(false);
    expect(namesMatch("", "x")).toBe(false);
  });

  it("falls back to the plain words when only descriptors are left", () => {
    expect(nameTokens("The Cafe")).toEqual(["the", "cafe"]);
  });
});

describe("nameVariants and searchQueries", () => {
  it("adds the name without a city or neighbourhood tail", () => {
    expect(nameVariants("Coffee Culture, Indore")).toEqual(["Coffee Culture, Indore", "Coffee Culture"]);
    expect(nameVariants("The Roastery - Soho")[1]).toBe("The Roastery");
    expect(nameVariants("Blue Tokai")).toEqual(["Blue Tokai"]);
  });

  it("tries the name, the name with the city for places, and the plain words", () => {
    expect(searchQueries("place", "The Green Mill Cocktail Lounge", "Chicago")).toEqual([
      "The Green Mill Cocktail Lounge",
      "The Green Mill Cocktail Lounge Chicago",
      "green mill",
    ]);
    expect(searchQueries("artist", "Prateek Kuhad", "Indore")).toEqual(["Prateek Kuhad"]);
  });
});

describe("classifyHits", () => {
  it("verifies a real venue that Qloo lists as a place near the city (the Green Mill case)", () => {
    const hits = [hit("b", "The Green Mill Murder (Phryne Fisher, #5)", ["book"]), hit("a", "The Green Mill", ["place"], [41.97, -87.66]), hit("c", "The Green Mill", ["place"], [-33.9, 18.4])];
    expect(classifyHits("place", "The Green Mill Cocktail Lounge", hits, CHICAGO)).toEqual({ status: "verified", qlooId: "a" });
  });

  it("judges a place by the matching entity closest to the city", () => {
    const hits = [hit("ny", "Music Box Theatre", ["place"], [40.76, -73.99]), hit("chi", "Music Box Theatre", ["place"], [41.95, -87.66])];
    expect(classifyHits("place", "Music Box Theatre", hits, CHICAGO).qlooId).toBe("chi");
  });

  it("says other_city when the only match is far away, and verifies a match without coordinates", () => {
    expect(classifyHits("place", "Amoeba Music", [hit("la", "Amoeba Music", ["place"], [34.1, -118.3])], CHICAGO)).toEqual({ status: "other_city", qlooId: "la" });
    expect(classifyHits("place", "Amoeba Music", [hit("x", "Amoeba Music", ["place"])], CHICAGO).status).toBe("verified");
  });

  it("says wrong_type when Qloo lists the name as another kind (an author searched as an artist)", () => {
    const hits = [hit("a", "Arundhati Roy", ["author"]), hit("b", "Arundhati Roy's The God of Small Things", ["book"])];
    expect(classifyHits("artist", "Arundhati Roy", hits)).toEqual({ status: "wrong_type", matchedName: "Arundhati Roy", matchedKind: "author" });
    expect(classifyHits("artist", "A24", [hit("c", "A24", ["brand"])])).toMatchObject({ status: "wrong_type", matchedKind: "brand" });
  });

  it("does not call a same-titled album or book a wrong-type match", () => {
    expect(classifyHits("artist", "Neon", [hit("n", "Neon", ["album"]), hit("m", "Neon", ["book"])]).status).toBe("unverified");
  });

  it("is unverified when nothing carries the name, and prefers a right-type match over a wrong-type one", () => {
    expect(classifyHits("place", "Imaginary Cafe", [hit("a", "Chaayos", ["place"], [41.9, -87.6])], CHICAGO)).toEqual({ status: "unverified" });
    const both = [hit("w", "Brooklyn Museum", ["brand"]), hit("p", "Brooklyn Museum", ["place"], [40.67, -73.96])];
    expect(classifyHits("place", "Brooklyn Museum", both, { lat: 40.65, lon: -73.95 })).toEqual({ status: "verified", qlooId: "p" });
  });

  it("does not judge artists or brands by location", () => {
    expect(classifyHits("artist", "Prateek Kuhad", [hit("p", "Prateek Kuhad", ["artist"], [1, 1])], CHICAGO).status).toBe("verified");
  });
});

describe("verifyPick", () => {
  const client = (answers: Record<string, VerifyHit[]>, calls: string[] = []): QlooClient =>
    ({
      search: async ({ query }: { query: string }) => {
        calls.push(query);
        const list = answers[query] ?? [];
        return { data: list.map((h) => ({ id: h.id, name: h.name, type: "urn:entity", kinds: h.kinds, ...(h.lat !== undefined ? { location: { latitude: h.lat, longitude: h.lon as number } } : {}) })) };
      },
    }) as unknown as QlooClient;

  it("stops at the first query that verifies the name", async () => {
    const calls: string[] = [];
    const q = client({ "Violet Hour": [hit("v", "The Violet Hour", ["place"], [41.91, -87.68])] }, calls);
    expect(await verifyPick(q, "place", "Violet Hour", { city: "Chicago", anchor: CHICAGO })).toEqual({ status: "verified", qlooId: "v" });
    expect(calls).toEqual(["Violet Hour"]);
  });

  it("falls back to the plain-words query when the full name finds nothing", async () => {
    const calls: string[] = [];
    const q = client({ "green mill": [hit("a", "The Green Mill", ["place"], [41.97, -87.66])] }, calls);
    const v = await verifyPick(q, "place", "The Green Mill Cocktail Lounge", { city: "Chicago", anchor: CHICAGO });
    expect(v.status).toBe("verified");
    expect(calls).toEqual(["The Green Mill Cocktail Lounge", "The Green Mill Cocktail Lounge Chicago", "green mill"]);
  });

  it("treats a failing search as no hits instead of throwing", async () => {
    const q = { search: async () => Promise.reject(new Error("boom")) } as unknown as QlooClient;
    expect(await verifyPick(q, "artist", "Someone")).toEqual({ status: "unverified" });
  });
});

describe("statusLabel", () => {
  it("never says invented", () => {
    for (const s of ["verified", "wrong_type", "other_city", "unverified"] as const) {
      expect(statusLabel(s, { matchedKind: "author" }, "Chicago")).not.toMatch(/invent/i);
    }
    expect(statusLabel("unverified", undefined, "Chicago")).toBe("Not in Qloo's data for Chicago");
    expect(statusLabel("wrong_type", { matchedKind: "author" })).toBe("Wrong type: Qloo lists a author by this name");
  });
});
