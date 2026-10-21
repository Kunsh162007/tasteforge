import { describe, expect, it } from "vitest";
import { paletteProblem } from "../palette";
import type { Ledger } from "../ledger";
import { finishPalette, NUDGE_MAX_DISTANCE, paletteLines } from "./apply";
import { extractCues, type Cue } from "./cues";
import { ACCENT_MIN_DISTANCE, ACCENT_MIN_SATURATION, derivePalette, MIN_SWATCH_DISTANCE, SUPPORT_MIN_DISTANCE } from "./derive";
import { FAMILIES, familiesFor } from "./families";
import { contrastRatio, distance, hexToHsl, hash01 } from "./math";
import { undertoneOf } from "./undertone";
import { colourName } from "./names";

const cue = (name: string, evidence = "ev_6", weight = 0.8, source: Cue["source"] = "style"): Cue => ({ name, source, weight, evidence, tagId: `urn:tag:decor:qloo:${name.toLowerCase().replace(/\W+/g, "_")}` });
const cues = (names: readonly string[], evidence = "ev_6", source: Cue["source"] = "style"): Cue[] => names.map((n, i) => cue(n, evidence, 0.9 - i * 0.1, source));

const VINTAGE = cues(["Vintage", "Retro", "Cozy"]);
const MINIMAL = cues(["Minimalist", "Modern", "Clean"]);
const BOTANICAL = cues(["Botanical", "Garden", "Plant"]);
const INDUSTRIAL = cues(["Industrial", "Exposed Brick", "Loft"]);

const hexes = (cs: readonly Cue[], salt?: string): string[] => derivePalette(cs, salt).map((s) => s.hex);

describe("tag to colour families", () => {
  it("has an entry for every role in every family, and keywords that match", () => {
    for (const f of FAMILIES) {
      for (const role of ["light", "mid", "deep", "accent"] as const) expect(f.tones.some((t) => t.role === role), `${f.id} ${role}`).toBe(true);
      expect(familiesFor(f.keywords[0]).map((x) => x.id), f.id).toContain(f.id);
    }
  });

  it("matches at word starts, not inside words", () => {
    expect(familiesFor("Rustic Charm").map((f) => f.id)).toContain("warm-wood");
    expect(familiesFor("Eclectic").map((f) => f.id)).toContain("bohemian-spice");
    expect(familiesFor("Barbecue").map((f) => f.id)).not.toContain("wine-cellar");
    expect(familiesFor("Zzyzx")).toHaveLength(0);
  });
});

describe("derivePalette", () => {
  it("gives different palettes for different tag sets", () => {
    const sets = [VINTAGE, MINIMAL, BOTANICAL, INDUSTRIAL].map((c) => hexes(c).join());
    expect(new Set(sets).size).toBe(sets.length);
  });

  it("is stable: the same cues always give the same palette", () => {
    expect(derivePalette(VINTAGE)).toEqual(derivePalette([...VINTAGE]));
    expect(derivePalette(MINIMAL, "x")).toEqual(derivePalette(MINIMAL, "x"));
  });

  it("varies inside the family with the Qloo ids behind it and with the salt, but not with ledger order", () => {
    const a = hexes(cues(["Vintage", "Retro", "Cozy"], "ev_6"));
    expect(hexes(cues(["Vintage", "Retro", "Cozy"], "ev_9"))).toEqual(a);
    const sameWordsOtherIds = ["Vintage", "Retro", "Cozy"].map((name, i) => ({ ...cue(name, "ev_6", 0.9 - i * 0.1), tagId: `urn:tag:ambience:qloo:other_${i}` }));
    const b = hexes(sameWordsOtherIds);
    expect(a).not.toEqual(b);
    expect(hexes(VINTAGE, "rejected")).not.toEqual(hexes(VINTAGE));
    // ...yet the same family: the lead colour stays in the pale vintage range.
    for (const h of [a[0], b[0]]) expect(hexToHsl(h).l).toBeGreaterThan(0.82);
  });

  it("follows the curated mapping: vintage is faded ochres, minimalist is cool whites and greys, botanical has greens", () => {
    const vintage = derivePalette(VINTAGE).filter((s) => s.family === "vintage-ochre");
    expect(vintage.length).toBeGreaterThan(0);
    for (const s of vintage) {
      const { h } = hexToHsl(s.hex);
      expect(h < 52 || h > 355).toBe(true);
    }
    const minimal = derivePalette(MINIMAL)[0];
    const hsl = hexToHsl(minimal.hex);
    expect(hsl.s).toBeLessThan(0.15);
    expect(hsl.h).toBeGreaterThan(195);
    expect(hsl.h).toBeLessThan(225);
    expect(derivePalette(BOTANICAL).some((s) => hexToHsl(s.hex).h > 85 && hexToHsl(s.hex).h < 165)).toBe(true);
  });

  it("weights by tag score: the stronger family leads the palette", () => {
    const vintageHeavy = [cue("Vintage", "ev_6", 0.95), cue("Minimalist", "ev_6", 0.2)];
    const minimalHeavy = [cue("Vintage", "ev_6", 0.2), cue("Minimalist", "ev_6", 0.95)];
    expect(derivePalette(vintageHeavy)[0].family).toBe("vintage-ochre");
    expect(derivePalette(minimalHeavy)[0].family).toBe("minimal-cool");
  });

  it("mixes music and cuisine cues into the palette when they carry weight", () => {
    const withJazz = [...cues(["Cozy"], "ev_6"), cue("Jazz", "ev_3", 0.9, "genre"), cue("Jazz Club", "ev_3", 0.8, "genre")];
    const families = derivePalette(withJazz).map((s) => s.family);
    expect(families).toContain("jazz-brass");
  });

  it("keeps an accent that clears the neutrals, for every family and many evidence seeds", () => {
    for (const f of FAMILIES) {
      for (let i = 0; i < 12; i += 1) {
        const seeded = cues([f.keywords[0].replace("=", ""), f.keywords[1] ?? f.keywords[0]], `ev_${i}`).map((c) => ({ ...c, tagId: `${c.tagId}_${i}` }));
        const palette = derivePalette(seeded);
        expect(palette.length, f.id).toBeGreaterThanOrEqual(4);
        expect(palette.length).toBeLessThanOrEqual(5);
        const accent = palette.find((s) => s.role === "accent");
        expect(accent, `${f.id} accent`).toBeDefined();
        const bases = palette.filter((s) => s !== accent);
        // Output order is light, mid, deep, accent, extra: the ground and the anchor are the neutrals that must contrast most.
        expect(distance(accent!.hex, palette[0].hex), `${f.id} light`).toBeGreaterThanOrEqual(ACCENT_MIN_DISTANCE);
        expect(distance(accent!.hex, palette[2].hex), `${f.id} deep`).toBeGreaterThanOrEqual(ACCENT_MIN_DISTANCE);
        for (const b of bases) expect(distance(accent!.hex, b.hex), `${f.id} ${accent!.hex} vs ${b.hex}`).toBeGreaterThanOrEqual(SUPPORT_MIN_DISTANCE);
        expect(hexToHsl(accent!.hex).s).toBeGreaterThanOrEqual(ACCENT_MIN_SATURATION);
        palette.forEach((a, x) => palette.slice(x + 1).forEach((b) => expect(distance(a.hex, b.hex)).toBeGreaterThanOrEqual(MIN_SWATCH_DISTANCE)));
        // The same quality check the model's palettes used to face.
        const swatches = palette.map((s) => ({ label: `c${s.hex}`, hex: s.hex, evidence: [...s.evidence], tags: [...s.tags], role: s.role }));
        expect(paletteProblem(swatches), f.id).toBeUndefined();
      }
    }
  });

  it("traces every swatch to tags that are in the cues, with the records that hold them", () => {
    const input = [...INDUSTRIAL, cue("Jazz", "ev_3", 0.9, "genre")];
    for (const s of derivePalette(input)) {
      expect(s.tags.length).toBeGreaterThan(0);
      for (const t of s.tags) expect(input.map((c) => c.name)).toContain(t);
      expect(s.evidence.length).toBeGreaterThan(0);
      for (const e of s.evidence) expect(input.filter((c) => s.tags.includes(c.name)).map((c) => c.evidence)).toContain(e);
    }
  });

  it("colours tags the table does not know from their own names, so different unknown tags differ", () => {
    const a = derivePalette(cues(["Zzyzx", "Quuxish"]));
    const b = derivePalette(cues(["Frobnicate", "Wibbly"]));
    expect(a.length).toBeGreaterThanOrEqual(4);
    expect(a.map((s) => s.hex)).not.toEqual(b.map((s) => s.hex));
    expect(a.every((s) => s.tags.length > 0)).toBe(true);
  });

  it("returns nothing without cues", () => {
    expect(derivePalette([])).toEqual([]);
  });
});

describe("extractCues", () => {
  const ledger: Ledger = {
    records: [
      { id: "ev_1", endpoint: "/v2/tags", params: {}, summary: "", tags: [{ id: "urn:tag:genre:music:indie", name: "Indie", score: 0.9 }, { id: "urn:tag:keyword:other", name: "Other" }, { id: "urn:tag:keyword:slow", name: "Slow living" }] },
      { id: "ev_6", endpoint: "/v2/insights (urn:tag)", params: {}, summary: "", tags: [{ id: "urn:tag:decor:qloo:vintage", name: "Vintage", score: 0.6 }, { id: "urn:tag:ambience:qloo:cozy", name: "Cozy", score: 0.3 }] },
      { id: "ev_7", endpoint: "/v2/insights (urn:tag)", params: {}, summary: "", tags: [{ id: "urn:tag:specialty_dish:place:bun", name: "Bun maska" }] },
    ],
  };

  it("takes style tags, the cuisine of the places, and only the concept and genre tags that became signals", () => {
    const found = extractCues(ledger, ["urn:tag:genre:music:indie", "urn:tag:keyword:slow"]);
    expect(found.map((c) => `${c.source}:${c.name}`).sort()).toEqual(["audience:Slow living", "cuisine:Bun maska", "genre:Indie", "style:Cozy", "style:Vintage"]);
    expect(found.find((c) => c.name === "Vintage")?.evidence).toBe("ev_6");
  });

  it("weights style tags above genre and audience tags of the same score", () => {
    const same: Ledger = {
      records: [
        { id: "ev_1", endpoint: "/v2/tags", params: {}, summary: "", tags: [{ id: "urn:tag:genre:music:indie", name: "Indie", score: 0.5 }, { id: "urn:tag:keyword:slow", name: "Slow living", score: 0.5 }] },
        { id: "ev_6", endpoint: "/v2/insights (urn:tag)", params: {}, summary: "", tags: [{ id: "urn:tag:decor:qloo:vintage", name: "Vintage", score: 0.5 }] },
      ],
    };
    const found = extractCues(same, ["urn:tag:genre:music:indie", "urn:tag:keyword:slow"]);
    expect(found.map((c) => c.source)).toEqual(["style", "genre", "audience"]);
  });
});

describe("finishPalette", () => {
  const derived = derivePalette(VINTAGE);

  it("takes tags, evidence and roles from code and names from the model", () => {
    const named = finishPalette(derived, derived.map((_, i) => ({ label: `Name ${i}`, hex: "#000000" })));
    named.forEach((s, i) => {
      expect(s.label).toBe(`Name ${i}`);
      expect(s.tags).toEqual(derived[i].tags);
      expect(s.evidence).toEqual(derived[i].evidence);
      expect(s.role).toBe(derived[i].role);
      expect(s.hex).toBe(derived[i].hex);
    });
  });

  it("accepts a small nudge and refuses a big one", () => {
    const [first] = derived;
    const near = `${first.hex.slice(0, 5)}${(parseInt(first.hex.slice(5), 16) % 250 + 3).toString(16).padStart(2, "0")}`;
    expect(distance(near, first.hex)).toBeLessThan(NUDGE_MAX_DISTANCE);
    const out = finishPalette(derived, [{ label: "Bone", hex: near }, { label: "Far", hex: "#FF00FF" }]);
    expect(out[0].hex).toBe(near.toUpperCase());
    expect(out[1].hex).toBe(derived[1].hex);
  });

  it("falls back to real colour names when the reply is missing, repeats a name or echoes a tag", () => {
    const echo = finishPalette(derived, [{ label: derived[0].tags[0] }, { label: "Same" }, { label: "same" }]);
    expect(echo[0].label).not.toBe(derived[0].tags[0]);
    expect(echo[2].label.toLowerCase()).not.toBe("same");
    const none = finishPalette(derived, undefined);
    expect(new Set(none.map((s) => s.label)).size).toBe(none.length);
    none.forEach((s) => expect(s.label.length).toBeGreaterThan(2));
  });

  it("lists the swatches compactly for the prompt", () => {
    const lines = paletteLines(derived).split("\n");
    expect(lines).toHaveLength(derived.length);
    expect(lines[0]).toMatch(/^1\. #[0-9A-F]{6} base; tags: /);
  });
});

describe("helpers", () => {
  it("hash01 is stable and spreads", () => {
    expect(hash01("a")).toBe(hash01("a"));
    expect(hash01("a")).not.toBe(hash01("b"));
    const values = Array.from({ length: 200 }, (_, i) => hash01(`k${i}`));
    expect(Math.min(...values)).toBeLessThan(0.1);
    expect(Math.max(...values)).toBeGreaterThan(0.9);
  });

  it("names a colour by its nearest table entry and avoids taken names", () => {
    expect(colourName("#B8654A")).toBe("Clay terracotta");
    expect(colourName("#B8654A", new Set(["clay terracotta"]))).not.toBe("Clay terracotta");
  });
});

describe("undertone of the neutrals", () => {
  const WARM = cues(["Cozy", "Rustic", "Wood"]).map((c, i) => ({ ...c, tagId: `${c.tagId}_w${i}` }));
  const COOL = cues(["Minimalist", "Concrete", "Airy"]).map((c, i) => ({ ...c, tagId: `${c.tagId}_c${i}` }));
  const NEUTRAL = cues(["Zzyzx", "Quuxish"]);

  it("reads warm and cool from the tags", () => {
    expect(undertoneOf(WARM)).toBeGreaterThan(0.5);
    expect(undertoneOf(COOL)).toBeLessThan(-0.5);
    expect(undertoneOf(NEUTRAL)).toBe(0);
    expect(undertoneOf([])).toBe(0);
  });

  it("gives a cosy brief a cream ground and a minimal one a cool white, clearly apart in hue", () => {
    const warm = hexToHsl(derivePalette(WARM)[0].hex);
    const cool = hexToHsl(derivePalette(COOL)[0].hex);
    expect(warm.h).toBeGreaterThan(20);
    expect(warm.h).toBeLessThan(55);
    expect(cool.h).toBeGreaterThan(195);
    expect(cool.h).toBeLessThan(235);
    expect(warm.s).toBeGreaterThan(cool.s);
  });

  it("does not let a leaning brief leave the accessible range: grounds stay light, anchors dark, accents clear", () => {
    for (const set of [WARM, COOL, VINTAGE, MINIMAL, BOTANICAL, INDUSTRIAL]) {
      const palette = derivePalette(set);
      expect(hexToHsl(palette[0].hex).l, "ground").toBeGreaterThan(0.84);
      const deep = palette.find((s) => s.hex === palette[2].hex)!;
      expect(contrastRatio(palette[0].hex, deep.hex)).toBeGreaterThanOrEqual(4.5);
      const accent = palette.find((s) => s.role === "accent")!;
      expect(distance(accent.hex, palette[0].hex)).toBeGreaterThanOrEqual(ACCENT_MIN_DISTANCE);
    }
  });

  it("makes the light grounds of briefs with different evidence differ", () => {
    const grounds = [WARM, COOL, VINTAGE, BOTANICAL, INDUSTRIAL].map((c) => derivePalette(c)[0].hex);
    expect(new Set(grounds).size).toBe(grounds.length);
  });
});
