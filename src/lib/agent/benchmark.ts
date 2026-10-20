import { CITY_RADIUS_KM, normalizeName, type GeoPoint } from "./pipeline/guard";
import { distanceKm } from "./summaries";

/**
 * Pure helpers for the fabrication benchmark (scripts/benchmark.mts, docs/BENCHMARK.md): decide whether a
 * plain-LLM pick exists in Qloo and sits in the requested city, then aggregate per pick type.
 */

export type BenchKind = "artist" | "place" | "brand";
export const BENCH_KINDS: readonly BenchKind[] = ["artist", "place", "brand"];

/** What a Qloo name search returned (names and coordinates only; the raw response is never kept). */
export type SearchHit = { readonly id: string; readonly name: string; readonly lat?: number; readonly lon?: number };

export type PickOutcome = {
  readonly kind: BenchKind;
  readonly name: string;
  /** Qloo returned an entity whose name matches the pick. */
  readonly found: boolean;
  readonly qlooId?: string;
  /** Places only: true when the closest matching entity lies outside the city; undefined when it has no coordinates. */
  readonly offCity?: boolean;
  /** Qloo's fit with the audience for found picks; null when unscored. */
  readonly affinity: number | null;
};

const MIN_CONTAINED_CHARS = 5;

/** Same name after normalising, or one name contained in the other ("Blue Tokai" vs "Blue Tokai Coffee Roasters"). */
export function namesMatch(a: string, b: string): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (x === "" || y === "") return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= MIN_CONTAINED_CHARS && ` ${long} `.includes(` ${short} `);
}

/** The name as written, plus the name without a ", City" or " - Neighbourhood" tail ("Barcade, Williamsburg" -> "Barcade"). */
export function nameVariants(name: string): string[] {
  const head = name.split(/\s*[,–—]\s*|\s+-\s+/)[0].trim();
  return head && head !== name.trim() ? [name.trim(), head] : [name.trim()];
}

/**
 * Gives the plain LLM every benefit of the doubt: it is "found" when any of the top hits matches its name, and for
 * places the hit closest to the city centre is the one judged against the city radius.
 */
export function resolvePick(kind: BenchKind, name: string, hits: readonly SearchHit[], anchor?: GeoPoint): Pick<PickOutcome, "found" | "qlooId" | "offCity"> {
  const matching = hits.filter((h) => namesMatch(name, h.name));
  if (matching.length === 0) return { found: false };
  if (kind !== "place" || !anchor) return { found: true, qlooId: matching[0].id };
  const km = (h: SearchHit): number =>
    h.lat === undefined || h.lon === undefined ? Infinity : distanceKm({ latitude: anchor.lat, longitude: anchor.lon }, { latitude: h.lat, longitude: h.lon });
  const best = matching.reduce((a, b) => (km(b) < km(a) ? b : a));
  const located = Number.isFinite(km(best));
  return { found: true, qlooId: best.id, ...(located ? { offCity: km(best) > CITY_RADIUS_KM } : {}) };
}

export type KindSummary = {
  readonly picks: number;
  readonly notFound: number;
  readonly notFoundRate: number | null;
  /** Found picks with coordinates, and how many of them lie outside the city (places only). */
  readonly located: number;
  readonly offCity: number;
  readonly offCityRate: number | null;
  /** Places only: share of picks that are missing from Qloo or outside the city. */
  readonly unverifiedRate: number | null;
  readonly scored: number;
  readonly meanFit: number | null;
};

const rate = (n: number, d: number): number | null => (d === 0 ? null : n / d);
const mean = (xs: readonly number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

export function summarizeKind(picks: readonly PickOutcome[]): KindSummary {
  const notFound = picks.filter((p) => !p.found).length;
  const located = picks.filter((p) => p.found && p.offCity !== undefined);
  const offCity = located.filter((p) => p.offCity).length;
  const fits = picks.flatMap((p) => (p.found && p.affinity !== null ? [p.affinity] : []));
  const isPlace = picks.some((p) => p.kind === "place");
  return {
    picks: picks.length,
    notFound,
    notFoundRate: rate(notFound, picks.length),
    located: located.length,
    offCity,
    offCityRate: rate(offCity, located.length),
    unverifiedRate: isPlace ? rate(notFound + offCity, picks.length) : null,
    scored: fits.length,
    meanFit: mean(fits),
  };
}

export const summarizeByKind = (picks: readonly PickOutcome[]): Record<BenchKind, KindSummary> => ({
  artist: summarizeKind(picks.filter((p) => p.kind === "artist")),
  place: summarizeKind(picks.filter((p) => p.kind === "place")),
  brand: summarizeKind(picks.filter((p) => p.kind === "brand")),
});

/** Overlap of two pick lists (Jaccard on normalised names): 1 = identical, 0 = nothing in common; null when both are empty. */
export function overlap(a: readonly string[], b: readonly string[]): number | null {
  const x = new Set(a.map(normalizeName));
  const y = new Set(b.map(normalizeName));
  const union = new Set([...x, ...y]).size;
  if (union === 0) return null;
  return [...x].filter((n) => y.has(n)).length / union;
}
