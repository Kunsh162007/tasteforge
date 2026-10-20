import type { Brief, Item } from "./contract";

/**
 * Pure diff of two briefs for the two-city view: for each slot (palette, places, artists, hotspots, ...)
 * which items both cities share and which belong to one city only.
 */

export type SlotKey = "palette" | "places" | "artists" | "hotspots" | "pairings" | "lighting" | "materials";

export type SlotDiff = {
  readonly key: SlotKey;
  readonly title: string;
  readonly shared: readonly { readonly a: Item; readonly b: Item }[];
  readonly onlyA: readonly Item[];
  readonly onlyB: readonly Item[];
};

export type CityComparison = {
  readonly slots: readonly SlotDiff[];
  /** Items present in both cities, across all slots. */
  readonly shared: number;
  /** Items found in one city only, across all slots. */
  readonly differing: number;
};

/** Two palette colours closer than this (Euclidean RGB distance) count as the same swatch. */
const SAME_COLOUR_DISTANCE = 28;

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function rgb(hex: string | undefined): [number, number, number] | undefined {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? "");
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : undefined;
}

function sameColour(a: Item, b: Item): boolean {
  const x = rgb((a as { hex?: string }).hex);
  const y = rgb((b as { hex?: string }).hex);
  if (!x || !y) return false;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) <= SAME_COLOUR_DISTANCE;
}

type Matcher = (a: Item, b: Item) => boolean;

const sameThing: Matcher = (a, b) => (a.qlooId !== undefined && a.qlooId === b.qlooId) || normalize(a.label) === normalize(b.label);
const sameSwatch: Matcher = (a, b) => sameThing(a, b) || sameColour(a, b);

function diffList(key: SlotKey, title: string, a: readonly Item[], b: readonly Item[], match: Matcher): SlotDiff {
  const used = new Set<number>();
  const shared: { a: Item; b: Item }[] = [];
  const onlyA: Item[] = [];
  for (const item of a) {
    const at = b.findIndex((other, i) => !used.has(i) && match(item, other));
    if (at < 0) {
      onlyA.push(item);
      continue;
    }
    used.add(at);
    shared.push({ a: item, b: b[at] });
  }
  return { key, title, shared, onlyA, onlyB: b.filter((_, i) => !used.has(i)) };
}

export function diffCities(a: Brief, b: Brief): CityComparison {
  const slots = [
    diffList("palette", "Palette", a.aesthetic.palette, b.aesthetic.palette, sameSwatch),
    diffList("places", "Places that set the tone", a.aesthetic.referencePlaces, b.aesthetic.referencePlaces, sameThing),
    diffList("artists", "Artists", a.sound.artists, b.sound.artists, sameThing),
    diffList("hotspots", "Hotspots", a.whereTheyAre?.hotspots ?? [], b.whereTheyAre?.hotspots ?? [], sameThing),
    diffList("pairings", "Pairings", a.pairings, b.pairings, sameThing),
    diffList("lighting", "Lighting", a.aesthetic.lighting, b.aesthetic.lighting, sameThing),
    diffList("materials", "Materials", a.aesthetic.materials, b.aesthetic.materials, sameThing),
  ];
  return {
    slots,
    shared: slots.reduce((n, s) => n + s.shared.length, 0),
    differing: slots.reduce((n, s) => n + s.onlyA.length + s.onlyB.length, 0),
  };
}
