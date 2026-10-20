import type { BriefDraft } from "./brief";

/**
 * A pure check of the palette the model wrote, used for one repair round: the brief should hand a designer a
 * working colour system (neutrals plus a clear accent, named like colours), not three near-identical beiges.
 */

type Swatch = BriefDraft["aesthetic"]["palette"][number];

/** Euclidean RGB distance at which two colours clearly read as different (0..441). */
const CLEAR_CONTRAST = 110;
/** HSL saturation an accent needs to stand out from muted neutrals. */
const ACCENT_SATURATION = 0.3;
const MIN_SWATCHES = 4;

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const distance = (a: string, b: string): number => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};

const saturation = (hex: string): number => {
  const [r, g, b] = rgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
};

const norm = (s: string): string => s.trim().toLowerCase();

/** A short instruction for the model when the palette is unusable, or undefined when it is fine (or empty). */
export function paletteProblem(palette: readonly Swatch[]): string | undefined {
  if (palette.length === 0) return undefined;
  const echoed = palette.filter((s) => (s.tags ?? []).some((t) => norm(t) === norm(s.label)));
  if (echoed.length > 0) return `swatch labels must be real colour names such as "Clay terracotta", not tag names (${echoed.map((s) => s.label).join(", ")})`;
  if (palette.length < MIN_SWATCHES) return `the palette needs 4 or 5 swatches, not ${palette.length}`;
  const spread = Math.max(...palette.flatMap((a, i) => palette.slice(i + 1).map((b) => distance(a.hex, b.hex))));
  const hasAccent = palette.some((s) => saturation(s.hex) >= ACCENT_SATURATION);
  if (spread < CLEAR_CONTRAST || !hasAccent) return "the colours are too alike: keep 2 or 3 muted neutrals and add at least one saturated accent in a clearly different hue";
  return undefined;
}
