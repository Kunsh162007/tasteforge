import { describe, expect, it } from "vitest";
import type { Brief } from "./agent/brief";
import type { Evidence } from "./agent/ledger";
import { makeDraft } from "./agent/testing";
import { mondayHtml, mondayText, escapeHtml } from "./mondayExport";
import { buildMondayList, isEmptyMonday, mondaySubtitle, spotifySearchUrl } from "./mondayList";

const item = (label: string, extra: Partial<{ detail: string; qlooId: string; evidence: string[] }> = {}) => ({ label, evidence: ["ev_1"], ...extra });

const evidence: Record<string, Evidence> = {
  ev_1: {
    id: "ev_1",
    endpoint: "/v2/insights",
    params: {},
    summary: "",
    entities: [
      { id: "P1", name: "Dusty Groove", note: "1120 N Ashland Ave Chicago | 4.7/5" },
      { id: "B1", name: "Reverb" },
    ],
  },
};

const brief: Brief = {
  ...makeDraft(["ev_1"], {
    sound: { direction: "x", artists: Array.from({ length: 12 }, (_, i) => item(`Artist ${i + 1}`)) },
    aesthetic: {
      palette: [{ ...item("Clay terracotta"), hex: "#b5654a" }, { ...item("Bone linen"), hex: "#e3d3b0" }],
      lighting: [],
      materials: [],
      referencePlaces: [{ ...item("Dusty Groove", { qlooId: "P1" }) }, item("Place 2"), item("Place 3"), item("Place 4")],
    },
    pairings: [{ ...item("Reverb", { qlooId: "B1" }) }, item("Banh mi plate", { detail: "Creative suggestion from Qloo tags: Banh Mi." }), item("Pho")],
    whereTheyAre: { city: "Chicago", hotspots: [item("Wicker Park"), item("Area near 41.900, -87.700"), item("Logan Square"), item("Pilsen"), item("Bronzeville")] },
    messaging: { tone: "warm", phrases: ["One", "Two", "Three", "Four"], evidence: ["ev_1"] },
  }),
  mode: "know_audience",
  groundingScore: 1,
};

describe("buildMondayList", () => {
  const m = buildMondayList(brief, evidence);

  it("makes a ten-track playlist with Spotify search links", () => {
    expect(m.playlist).toHaveLength(10);
    expect(m.playlist[0]).toEqual({ name: "Artist 1", url: "https://open.spotify.com/search/Artist%201" });
    expect(spotifySearchUrl("Beyoncé & Co")).toBe("https://open.spotify.com/search/Beyonc%C3%A9%20%26%20Co");
  });

  it("lists the palette with upper-case hex codes", () => {
    expect(m.palette).toEqual([{ name: "Clay terracotta", hex: "#B5654A" }, { name: "Bone linen", hex: "#E3D3B0" }]);
  });

  it("picks three rooms and gives Qloo's street address when it has one", () => {
    expect(m.places.map((p) => p.name)).toEqual(["Dusty Groove", "Place 2", "Place 3"]);
    expect(m.places[0].where).toBe("1120 N Ashland Ave Chicago");
  });

  it("puts menu ideas before brand collaborations and takes two", () => {
    expect(m.menu.map((x) => x.name)).toEqual(["Banh mi plate", "Pho"]);
    const onlyBrands = buildMondayList({ ...brief, pairings: [{ ...item("Reverb", { qlooId: "B1" }) }] }, evidence);
    expect(onlyBrands.menu).toEqual([{ name: "Reverb", kind: "collab" }]);
  });

  it("labels each menu entry by kind and punctuates the notes", () => {
    const mixed = buildMondayList(
      { ...brief, pairings: [item("Reverb", { qlooId: "B1" }), item("Natural Wine", { detail: "Natural Wine Creative suggestion from Qloo tags: Jazz" })] },
      evidence,
    );
    expect(mixed.menu).toEqual([
      { name: "Natural Wine", kind: "idea", why: "Natural Wine. Creative suggestion from Qloo tags: Jazz." },
      { name: "Reverb", kind: "collab" },
    ]);
  });

  it("does not repeat the city in the subtitle", () => {
    expect(mondaySubtitle({ title: "Chicago", city: "Chicago" })).toBe("Chicago");
    expect(mondaySubtitle({ title: "A jazz cafe in Chicago", city: "Chicago" })).toBe("A jazz cafe in Chicago");
    expect(mondaySubtitle({ title: "A jazz cafe", city: "Chicago" })).toBe("A jazz cafe, Chicago");
  });

  it("takes three copy lines and three named flyer neighbourhoods, never a coordinate placeholder", () => {
    expect(m.copy).toEqual(["One", "Two", "Three"]);
    expect(m.flyers.map((f) => f.name)).toEqual(["Wicker Park", "Logan Square", "Pilsen"]);
  });

  it("reports an empty list when the brief has nothing to act on", () => {
    const empty = buildMondayList(
      { ...brief, sound: { direction: "", artists: [] }, aesthetic: { palette: [], lighting: [], materials: [], referencePlaces: [] }, pairings: [], whereTheyAre: undefined, messaging: { tone: "", phrases: [], evidence: [] } },
      evidence,
    );
    expect(isEmptyMonday(empty)).toBe(true);
    expect(isEmptyMonday(m)).toBe(false);
  });
});

describe("export", () => {
  const m = buildMondayList(brief, evidence);

  it("renders a checklist as plain text", () => {
    const text = mondayText(m);
    expect(text).toContain("MONDAY LIST: ");
    expect(text).toContain("  [ ] Artist 1: https://open.spotify.com/search/Artist%201");
    expect(text).toContain("  [ ] Clay terracotta #B5654A");
    expect(text).toContain("  [ ] Dusty Groove, 1120 N Ashland Ave Chicago");
    expect(text).toContain("HAND OUT FLYERS IN");
  });

  it("renders a standalone HTML page and escapes everything", () => {
    const hostile = buildMondayList({ ...brief, title: "<script>alert(1)</script>", messaging: { tone: "", phrases: ['"><img src=x onerror=alert(1)>'], evidence: ["ev_1"] } }, evidence);
    const html = mondayHtml(hostile);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('href="https://open.spotify.com/search/Artist%201"');
    expect(html).toContain("background:#B5654A");
  });

  it("drops non-https links and non-hex colours", () => {
    const html = mondayHtml({ ...m, playlist: [{ name: "X", url: "javascript:alert(1)" }], palette: [{ name: "Bad", hex: "red;background:url(x)" }] });
    expect(html).not.toContain("javascript:");
    expect(html).toContain("background:#cccccc");
  });

  it("escapes the five HTML characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
