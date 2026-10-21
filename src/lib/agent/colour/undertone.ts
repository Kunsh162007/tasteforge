import type { Cue } from "./cues";
import { hash01, type Hsl } from "./math";

/**
 * Warm or cool undertone of a brief, read from its tags. The light ground and the mid-tone lean towards clay and cream
 * when the evidence is cosy, wooden, folk or spiced, and towards slate and ice when it is minimal, industrial, electronic
 * or coastal. Before this, the neutrals of nearly every brief were the same off-white.
 */

const WARM_WORDS = [
  "cozy", "cosy", "warm", "rustic", "vintage", "retro", "wood", "farmhouse", "earthy", "candle", "fireplace", "intimate", "romantic",
  "traditional", "homey", "homely", "handmade", "craft", "artisan", "coffee", "spice", "bbq", "barbecue", "mexican", "indian", "italian",
  "folk", "country", "jazz", "soul", "blues", "bohemian", "boho", "eclectic", "sunny", "tropical", "terracotta", "clay", "leather", "brick",
  "slow living", "comfort", "bakery", "bollywood", "reggae", "cafe", "wine",
];
const COOL_WORDS = [
  "minimal", "modern", "contemporary", "sleek", "industrial", "concrete", "steel", "glass", "clean", "airy", "bright", "nordic", "scandinav",
  "tech", "electronic", "techno", "ambient", "coastal", "ocean", "sea", "seafood", "sushi", "nautical", "aegean", "fresh", "urban", "chic",
  "gallery", "white", "futuristic", "indie pop", "dream pop", "classical", "greek", "japanese", "loft", "trendy", "hip hop", "hip-hop",
];

const WORD_START = (words: readonly string[]): RegExp => new RegExp(`\\b(?:${words.map((w) => w.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})`, "i");
const WARM = WORD_START(WARM_WORDS);
const COOL = WORD_START(COOL_WORDS);

/** Cues that say nothing about temperature count this much in the denominator, so a few warm words in a long list still lean warm. */
const NEUTRAL_SHARE = 0.4;

/** -1 (cool) to 1 (warm); 0 when the tags do not lean either way. */
export function undertoneOf(cues: readonly Cue[]): number {
  let warm = 0;
  let cool = 0;
  let neutral = 0;
  for (const c of cues) {
    const w = WARM.test(c.name);
    const k = COOL.test(c.name);
    if (w && !k) warm += c.weight;
    else if (k && !w) cool += c.weight;
    else neutral += c.weight;
  }
  const total = warm + cool + neutral * NEUTRAL_SHARE;
  return total === 0 ? 0 : Math.max(-1, Math.min(1, (warm - cool) / total));
}

/** The undertone must be this strong before it moves a colour at all, and reaches full strength at LEAN_FULL. */
const LEAN_MIN = 0.12;
const LEAN_FULL = 0.5;

type Target = { readonly h: readonly [number, number]; readonly s: readonly [number, number]; readonly l: readonly [number, number] };

/** Where a neutral goes at full lean. Cool whites stay barely saturated; warm creams carry visible colour. */
const TARGETS: Readonly<Record<"light" | "mid", Readonly<Record<"warm" | "cool", Target>>>> = {
  light: {
    warm: { h: [30, 44], s: [0.3, 0.46], l: [0.86, 0.92] },
    cool: { h: [204, 222], s: [0.09, 0.14], l: [0.91, 0.95] },
  },
  mid: {
    warm: { h: [24, 38], s: [0.28, 0.42], l: [0.54, 0.64] },
    cool: { h: [206, 224], s: [0.1, 0.2], l: [0.54, 0.64] },
  },
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const within = ([lo, hi]: readonly [number, number], u: number): number => lo + (hi - lo) * u;

function lerpHue(from: number, to: number, t: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return (from + delta * t + 360) % 360;
}

/** A light or mid neutral leaned towards the brief's undertone; unchanged when the tags lean neither way. */
export function leanNeutral(hsl: Hsl, role: "light" | "mid", undertone: number, seed: string): Hsl {
  const strength = Math.abs(undertone);
  if (strength < LEAN_MIN) return hsl;
  const t = Math.min(1, (strength - LEAN_MIN) / (LEAN_FULL - LEAN_MIN)) * (role === "light" ? 0.9 : 0.75);
  const target = TARGETS[role][undertone > 0 ? "warm" : "cool"];
  const key = `${seed}#undertone#${role}`;
  return {
    h: lerpHue(hsl.h, within(target.h, hash01(`${key}#h`)), t),
    s: lerp(hsl.s, within(target.s, hash01(`${key}#s`)), t),
    l: lerp(hsl.l, within(target.l, hash01(`${key}#l`)), t * 0.7),
  };
}
