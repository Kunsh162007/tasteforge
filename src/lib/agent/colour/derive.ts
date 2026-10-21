import type { Cue } from "./cues";
import { FAMILIES, familiesFor, SHARED_ACCENTS, type Family, type Role, type Tone } from "./families";
import { distance, hash01, hexToHsl, hslToHex, type Hsl } from "./math";
import { leanNeutral, undertoneOf } from "./undertone";

/**
 * Derives a colour palette from one brief's cues. No model is involved: tags map to colour families (families.ts),
 * families are weighted by their tags' scores, neutrals plus an accent are picked deterministically, and a stable hash
 * of the evidence behind the cues chooses the exact values inside each family's ranges.
 */

export type DerivedSwatch = {
  readonly hex: string;
  /** "accent" for the colour that stands out from the rest; "base" for neutrals and supporting tones. */
  readonly role: "base" | "accent";
  /** The tag names that drove this colour, verbatim (strongest first). */
  readonly tags: readonly string[];
  /** The ledger records holding those tags. */
  readonly evidence: readonly string[];
  /** The colour family it came from (for tests and diagnostics). */
  readonly family: string;
};

/**
 * An accent must differ from the light ground and the deep anchor by at least this RGB distance (0..441), from the
 * mid-tone and any fifth colour by SUPPORT_MIN_DISTANCE, and be this saturated.
 */
export const ACCENT_MIN_DISTANCE = 100;
export const SUPPORT_MIN_DISTANCE = 60;
export const ACCENT_MIN_SATURATION = 0.32;
/** Any two swatches must be at least this far apart, so the palette never repeats a colour. */
export const MIN_SWATCH_DISTANCE = 45;
const MAX_FAMILIES = 4;
const UNKNOWN_STYLE_SCALE = 0.5;
/** Accent tones tried per family before the next family is asked (its own and the shared ones). */
const ACCENT_TRIES = 6;
/** A family below this share of the strongest family's weight does not shape the palette. */
const FAMILY_SHARE_FLOOR = 0.25;
const TAGS_PER_SWATCH = 3;
const ADJUST_STEPS = 10;
const ADJUST_STEP = 0.035;

type Weighted = { readonly family: Family; readonly weight: number; readonly cues: readonly Cue[] };

const lerp = ([lo, hi]: readonly [number, number], u: number): number => lo + (hi - lo) * u;

/** A pseudo-family for tags the curated table does not know: the hue comes from the tag names themselves. */
function hashedFamily(cues: readonly Cue[]): Family {
  const hue = hash01(cues.map((c) => c.name.toLowerCase()).sort().join("|")) * 360;
  const range = (offset: number, spread = 8): readonly [number, number] => [(hue + offset) % 360, (hue + offset + spread) % 360];
  return {
    id: "hashed",
    keywords: [],
    tones: [
      { role: "light", h: range(0), s: [0.15, 0.3], l: [0.9, 0.94] },
      { role: "mid", h: range(20), s: [0.12, 0.22], l: [0.5, 0.62] },
      { role: "deep", h: range(0), s: [0.3, 0.45], l: [0.16, 0.24] },
      { role: "accent", h: range(160, 24), s: [0.55, 0.7], l: [0.46, 0.56] },
    ],
  };
}

function weighFamilies(cues: readonly Cue[]): Weighted[] {
  const byId = new Map<string, { family: Family; weight: number; cues: Cue[] }>();
  const unmatched: Cue[] = [];
  for (const cue of cues) {
    const hits = familiesFor(cue.name);
    if (hits.length === 0) {
      unmatched.push(cue);
      continue;
    }
    for (const family of hits) {
      const entry = byId.get(family.id) ?? { family, weight: 0, cues: [] };
      entry.weight += (cue.weight * (family.weightScale ?? 1)) / hits.length;
      entry.cues.push(cue);
      byId.set(family.id, entry);
    }
  }
  const matched = [...byId.values()];
  // Decor and ambience words the table does not know still colour the palette (hue from their names), at half weight so
  // a known family of equal strength wins. Dishes, genres and concepts it does not know are left out, unless nothing
  // else matched at all.
  const unknownStyle = unmatched.filter((c) => c.source === "style");
  const strangerCues = matched.length === 0 ? unmatched : unknownStyle;
  const strangers =
    strangerCues.length > 0
      ? [{ family: hashedFamily(strangerCues), weight: strangerCues.reduce((s, c) => s + c.weight, 0) * (matched.length === 0 ? 1 : UNKNOWN_STYLE_SCALE), cues: strangerCues }]
      : [];
  const all = [...matched, ...strangers].sort((a, b) => b.weight - a.weight || a.family.id.localeCompare(b.family.id));
  const top = all[0]?.weight ?? 0;
  return all.filter((w, i) => i === 0 || w.weight >= top * FAMILY_SHARE_FLOOR).slice(0, MAX_FAMILIES);
}

/** `pick` rotates which of a family's tones for the role is used (the accent tries each in turn). */
type Sampler = (family: Family, role: Role, slot: string, pick?: number) => Hsl | undefined;

function makeSampler(seed: string, undertone: number): Sampler {
  return (family, role, slot, pick = 0) => {
    const own = family.tones.filter((t) => t.role === role);
    // A family's own accents count three times in the draw, so its character still shows most of the time.
    const options = role === "accent" && family.id !== "hashed" ? [...own, ...own, ...own, ...SHARED_ACCENTS] : own;
    if (options.length === 0) return undefined;
    const key = `${seed}#${family.id}#${slot}`;
    const tone: Tone = options[(Math.floor(hash01(`${key}#tone`) * options.length) + pick) % options.length];
    const hsl = { h: lerp(tone.h, hash01(`${key}#h`)), s: lerp(tone.s, hash01(`${key}#s`)), l: lerp(tone.l, hash01(`${key}#l`)) };
    // The light ground and the mid-tone take the brief's warm or cool undertone; the deep anchor and the accents keep their family's colour.
    return role === "light" || role === "mid" ? leanNeutral(hsl, role, undertone, seed) : hsl;
  };
}

const saturationOf = (hex: string): number => hexToHsl(hex).s;

const farFromAll = (hex: string, others: readonly string[], min: number): boolean => others.every((o) => distance(hex, o) >= min);

/** The accent nudged in lightness (then saturation) until it stands clear of the neutrals; undefined if it cannot. */
function fitAccent(hsl: Hsl, bases: readonly string[]): string | undefined {
  for (let step = 0; step <= ADJUST_STEPS; step += 1) {
    for (const sign of step === 0 ? [0] : [-1, 1]) {
      const candidate = hslToHex({ h: hsl.h, s: Math.max(hsl.s, ACCENT_MIN_SATURATION + 0.02), l: Math.min(Math.max(hsl.l + sign * step * ADJUST_STEP, 0.25), 0.7) });
      if (saturationOf(candidate) >= ACCENT_MIN_SATURATION && farFromAll(candidate, bases, ACCENT_MIN_DISTANCE)) return candidate;
    }
  }
  return undefined;
}

/** A support colour kept clear of what is already in the palette by darkening or lightening it. */
function separate(hsl: Hsl, taken: readonly string[], accent?: string): string | undefined {
  for (let step = 0; step <= ADJUST_STEPS; step += 1) {
    for (const sign of step === 0 ? [0] : [-1, 1]) {
      const candidate = hslToHex({ ...hsl, l: Math.min(Math.max(hsl.l + sign * step * ADJUST_STEP * 1.5, 0.08), 0.95) });
      // A neutral added after the accent must not creep up on it.
      if (accent && distance(candidate, accent) < SUPPORT_MIN_DISTANCE) continue;
      if (farFromAll(candidate, taken, MIN_SWATCH_DISTANCE)) return candidate;
    }
  }
  return undefined;
}

function swatchOf(hex: string, role: DerivedSwatch["role"], w: Weighted): DerivedSwatch {
  const lead = [...w.cues].sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name)).slice(0, TAGS_PER_SWATCH);
  return { hex, role, family: w.family.id, tags: lead.map((c) => c.name), evidence: [...new Set(lead.map((c) => c.evidence))] };
}

/**
 * The palette for a set of cues, 4 to 5 swatches: a light ground, a mid-tone, a deep anchor, an accent that clears
 * the neutrals, and when the evidence is rich enough a fifth support colour. Empty when there are no cues.
 * `salt` varies the choice without changing the evidence (the refine loop passes the rejected colours).
 */
export function derivePalette(cues: readonly Cue[], salt = ""): DerivedSwatch[] {
  const families = weighFamilies(cues);
  if (families.length === 0) return [];
  // The Qloo ids of the tags behind the cues: the same evidence hashes the same on every run, whatever order the calls finished in
  // (ledger ids such as ev_7 depend on that order, so they stay out of the hash).
  const seed = `${[...new Set(cues.map((c) => c.tagId))].sort().join("|")}${salt}`;
  const sample = makeSampler(seed, undertoneOf(cues));
  const [first, second = first, third = second, fourth = third] = families;
  const out: DerivedSwatch[] = [];
  const bySlot = new Map<string, DerivedSwatch>();
  const hexes = (): string[] => out.map((s) => s.hex);
  const accentHex = (): string | undefined => out.find((s) => s.role === "accent")?.hex;

  /** Places one swatch; a support colour placed after the accent is kept clear of it. */
  const place = (slot: string, w: Weighted, role: Role, kind: DerivedSwatch["role"], pick = 0): boolean => {
    const hsl = sample(w.family, role, slot, pick);
    if (!hsl) return false;
    const hex = kind === "accent" ? fitAccent(hsl, hexes()) : separate(hsl, hexes(), accentHex());
    if (!hex) return false;
    const swatch = swatchOf(hex, kind, w);
    out.push(swatch);
    bySlot.set(slot, swatch);
    return true;
  };
  const placeAny = (slot: string, role: Role, kind: DerivedSwatch["role"], order: readonly Weighted[]): boolean =>
    order.some((w) => place(slot, w, role, kind));

  placeAny("light", "light", "base", [first]);
  // Each of the top families lends a tone, so the palette reflects the mix rather than only the strongest tag.
  placeAny("deep", "deep", "base", [third, first]);
  // The accent comes from the second-ranked family when there is one: it brings the contrast the first one lacks.
  // Every accent tone of each family is tried in turn before falling back to the lead colour's complement.
  [fourth, second, third, first].some((w, i) => Array.from({ length: ACCENT_TRIES }).some((_, pick) => place(`accent${i}`, w, "accent", "accent", pick)));
  if (!accentHex()) {
    const lead = hexToHsl(out[0]?.hex ?? "#808080");
    const hex = fitAccent({ h: (lead.h + 180) % 360, s: 0.6, l: 0.5 }, hexes());
    if (hex) {
      const swatch = swatchOf(hex, "accent", first);
      out.push(swatch);
      bySlot.set("accent", swatch);
    }
  }
  // The mid-tone and a fifth colour come last, so they are chosen around the accent rather than competing with it.
  placeAny("mid", "mid", "base", [second, first]);
  if (!placeAny("extra", "mid", "base", [fourth, third, second])) placeAny("extra", "deep", "base", [second, fourth, third]);
  return ["light", "mid", "deep", "accent0", "accent1", "accent2", "accent3", "accent", "extra"].flatMap((slot) => bySlot.get(slot) ?? []);
}

export const FAMILY_IDS: readonly string[] = FAMILIES.map((f) => f.id);
