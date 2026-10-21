import type { Brief, Item } from "../brief";
import type { EvidenceEntity, Ledger } from "../ledger";
import { distanceKm } from "../summaries";

/**
 * Deterministic clean-up of what Qloo returned, applied before results become evidence (so the writer never
 * sees them) and again on the finished brief: the user's own seeds are input, not discoveries, and places far
 * outside the requested city are wrong however well they fit the taste.
 */

/** Places further than this from the cluster centre of the city's results are treated as another city. */
export const CITY_RADIUS_KM = 50;
/** The cluster centre needs at least this many located places to be trusted. */
const MIN_LOCATED_FOR_ANCHOR = 3;

export type GeoPoint = { readonly lat: number; readonly lon: number };

/** The one mutable cell of the guard is `anchor`: it is learned from the first city result with enough coordinates. */
export type Guard = {
  readonly seedIds: ReadonlySet<string>;
  readonly seedNames: ReadonlySet<string>;
  readonly city?: string;
  anchor?: GeoPoint;
  /** Running totals of what was removed, so the critic can tell a thin section from a filtered one. */
  readonly removed: { seeds: number; offCity: number };
};

export const normalizeName = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function createGuard(
  signals: { readonly entityIds: readonly string[]; readonly entityNames: readonly string[] },
  city?: string,
): Guard {
  return {
    seedIds: new Set(signals.entityIds),
    seedNames: new Set(signals.entityNames.map(normalizeName).filter(Boolean)),
    ...(city ? { city } : {}),
    removed: { seeds: 0, offCity: 0 },
  };
}

export const isSeedName = (guard: Guard, name: string): boolean => guard.seedNames.has(normalizeName(name));
const isSeedEntity = (guard: Guard, e: { readonly id: string; readonly name: string }): boolean =>
  guard.seedIds.has(e.id) || isSeedName(guard, e.name);

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const located = (e: EvidenceEntity): e is EvidenceEntity & { lat: number; lon: number } => e.lat !== undefined && e.lon !== undefined;

/**
 * The located entity with the smallest total distance to the others (a medoid), so a few strays in another
 * country cannot drag the centre away from where most results are. Undefined when there are too few to trust.
 */
export function medianPoint(entities: readonly EvidenceEntity[], min = 2): GeoPoint | undefined {
  const pts = entities.filter(located);
  if (pts.length < min) return undefined;
  const cell = (p: { lat: number; lon: number }) => ({ latitude: p.lat, longitude: p.lon });
  const total = (p: { lat: number; lon: number }) => pts.reduce((sum, q) => sum + distanceKm(cell(p), cell(q)), 0);
  const best = pts.reduce((a, b) => (total(b) < total(a) ? b : a));
  return { lat: best.lat, lon: best.lon };
}

/** Where the city is, from the places the walk found (undefined when too few have coordinates). */
export function cityAnchor(ledger: Ledger): GeoPoint | undefined {
  return medianPoint(
    ledger.records.filter((r) => r.params.type === "place").flatMap((r) => r.entities ?? []),
    MIN_LOCATED_FOR_ANCHOR,
  );
}

export type Scrubbed = {
  readonly kept: readonly EvidenceEntity[];
  readonly removedSeeds: number;
  readonly removedOffCity: number;
};

/**
 * Removes seeds and, for place results, anything outside the city's cluster. Places without coordinates are
 * kept (nothing to judge them by).
 */
export function scrubEntities(entities: readonly EvidenceEntity[], guard: Guard, checkCity: boolean): Scrubbed {
  const noSeeds = entities.filter((e) => !isSeedEntity(guard, e));
  const removedSeeds = entities.length - noSeeds.length;
  guard.removed.seeds += removedSeeds;
  if (!checkCity || !guard.city) return { kept: noSeeds, removedSeeds, removedOffCity: 0 };
  if (!guard.anchor && noSeeds.filter(located).length >= MIN_LOCATED_FOR_ANCHOR) guard.anchor = medianPoint(noSeeds, MIN_LOCATED_FOR_ANCHOR);
  const anchor = guard.anchor;
  if (!anchor) return { kept: noSeeds, removedSeeds, removedOffCity: 0 };
  const inCity = noSeeds.filter(
    (e) => !located(e) || distanceKm({ latitude: anchor.lat, longitude: anchor.lon }, { latitude: e.lat, longitude: e.lon }) <= CITY_RADIUS_KM,
  );
  guard.removed.offCity += noSeeds.length - inCity.length;
  return { kept: inCity, removedSeeds, removedOffCity: noSeeds.length - inCity.length };
}

/** Entities whose affinity is at least the median of the batch; a batch without affinities is left alone. */
export function keepAboveMedian(entities: readonly EvidenceEntity[]): EvidenceEntity[] {
  const scores = entities.flatMap((e) => (e.affinity === undefined ? [] : [e.affinity]));
  if (scores.length < 2) return [...entities];
  const cut = median(scores);
  return entities.filter((e) => e.affinity === undefined || e.affinity >= cut);
}

/** The brief without items that are the user's own seeds (by Qloo id or normalized name). */
export function dropSeedEchoes(brief: Brief, guard: Guard): Brief {
  if (guard.seedIds.size === 0 && guard.seedNames.size === 0) return brief;
  const notSeed = <T extends Item>(items: readonly T[]): T[] =>
    items.filter((i) => !(i.qlooId !== undefined && guard.seedIds.has(i.qlooId)) && !isSeedName(guard, i.label));
  return {
    ...brief,
    audienceProfile: { ...brief.audienceProfile, affinities: notSeed(brief.audienceProfile.affinities) },
    aesthetic: { ...brief.aesthetic, referencePlaces: notSeed(brief.aesthetic.referencePlaces) },
    sound: { ...brief.sound, artists: notSeed(brief.sound.artists) },
    pairings: notSeed(brief.pairings),
  };
}
