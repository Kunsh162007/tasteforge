import type { Demographics, HeatmapCell, QlooEntity, QlooResult, QlooTag, TrendPoint } from "@/lib/qloo";
import type { CityCentre } from "./cityCentre";
import { compactEntities, compactTags, LLM_VIEW_LIMIT, type EvidenceDraft, type EvidenceEntity, type EvidenceTag } from "./ledger";

/** Builds compact evidence drafts from normalized Qloo results. */

type Base = { endpoint: string; params: Readonly<Record<string, string>> };

const SUMMARY_NAMES = 5;
const pct = (n: number): string => `${Math.round(n * 100)}%`;

function empty(base: Base, warning: string | undefined): EvidenceDraft {
  return { ...base, summary: `No results. ${warning ?? "Try broader seeds, other tags or another location."}` };
}

export function entityDraft(base: Base, r: QlooResult<QlooEntity>): EvidenceDraft {
  if (r.data.length === 0) return empty(base, r.warning);
  const entities = compactEntities(
    r.data.map((e) => ({
      id: e.id,
      name: e.name,
      affinity: e.affinity,
      note: e.note,
      ...(e.location ? { lat: Math.round(e.location.latitude * 1e5) / 1e5, lon: Math.round(e.location.longitude * 1e5) / 1e5 } : {}),
    })),
  );
  const top = entities.slice(0, SUMMARY_NAMES).map((e) => e.name).join(", ");
  return { ...base, summary: `${r.data.length} results; top: ${top}`, entities };
}

/** A tag draft with its tags replaced; the summary follows. */
export function withTags<T extends { readonly summary: string; readonly tags?: readonly EvidenceTag[] }>(draft: T, tags: readonly EvidenceTag[]): T {
  const top = tags.slice(0, SUMMARY_NAMES).map((t) => t.name).join(", ");
  return { ...draft, tags, summary: `${tags.length} tags; top: ${top}` };
}

/** An entity draft restricted to `kept`; the summary follows, and an emptied draft reads as "No results". */
export function withEntities(draft: EvidenceDraft, kept: readonly EvidenceEntity[], why: string): EvidenceDraft {
  if (kept.length === 0) return { ...draft, entities: [], summary: `No results. ${why}` };
  const top = kept.slice(0, SUMMARY_NAMES).map((e) => e.name).join(", ");
  return { ...draft, entities: kept, summary: `${kept.length} results; top: ${top}` };
}

export function tagDraft(base: Base, r: QlooResult<QlooTag>, limit = LLM_VIEW_LIMIT): EvidenceDraft {
  if (r.data.length === 0) return empty(base, r.warning);
  // The same word in two families ("Luxurious" as decor and ambience) is one tag to a reader.
  const seen = new Set<string>();
  const distinct = r.data.filter((t) => (seen.has(t.name.toLowerCase()) ? false : (seen.add(t.name.toLowerCase()), true)));
  const tags = compactTags(distinct.map((t) => ({ id: t.id, name: t.name, score: t.score })), limit);
  const top = tags.slice(0, SUMMARY_NAMES).map((t) => t.name).join(", ");
  return { ...base, summary: `${r.data.length} tags; top: ${top}`, tags };
}

/** Qloo demographics are signed deviations from the general population, so only over-indexing buckets are named. */
function topBuckets(buckets: Readonly<Record<string, number>>, n: number): string {
  const over = Object.entries(buckets)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k} +${pct(v)}`);
  return over.length > 0 ? over.join(", ") : "no clear skew";
}

export function demographicsDraft(base: Base, r: QlooResult<Demographics>): EvidenceDraft {
  const first = r.data[0];
  if (!first) return empty(base, r.warning);
  const summary = `Audience over-indexes (vs general population) on age: ${topBuckets(first.age, 3)}; gender: ${topBuckets(first.gender, 2)}`;
  return { ...base, summary };
}

/** Placeholder name for a hotspot Qloo returned without an area name; the pipeline tries to replace it. */
export const UNNAMED_AREA_PREFIX = "Area near ";

export const isUnnamedArea = (name: string): boolean => name.startsWith(UNNAMED_AREA_PREFIX);

const EARTH_KM = 6371;
/** Hotspots closer than this to a stronger one add nothing: neighbouring geohash cells describe one area. */
const MIN_HOTSPOT_SPACING_KM = 2;
const CENTRAL_KM = 1.5;
const COMPASS = ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"] as const;

export type Cell = { readonly latitude: number; readonly longitude: number };

const rad = (deg: number): number => (deg * Math.PI) / 180;

export function distanceKm(a: Cell, b: Cell): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** Strongest cells first (ties broken by popularity), skipping cells that sit next to one already chosen. */
function spreadHotspots(cells: readonly HeatmapCell[], n: number): HeatmapCell[] {
  const ranked = [...cells].sort((a, b) => b.affinity - a.affinity || (b.popularity ?? 0) - (a.popularity ?? 0));
  const chosen: HeatmapCell[] = [];
  for (const c of ranked) {
    if (chosen.every((p) => distanceKm(p, c) >= MIN_HOTSPOT_SPACING_KM)) chosen.push(c);
    if (chosen.length === n) return chosen;
  }
  // Fewer well-separated areas than wanted: fill up with the strongest remaining cells.
  return [...chosen, ...ranked.filter((c) => !chosen.includes(c))].slice(0, n);
}

/** Where a cell lies relative to the city centre (or the mean of the cells), e.g. "north-east of the Indore centre, 6 km out". */
function describeOffset(cell: Cell, all: readonly Cell[], city: string, centre?: { readonly lat: number; readonly lon: number }): string {
  const center = centre
    ? { latitude: centre.lat, longitude: centre.lon }
    : { latitude: all.reduce((s, c) => s + c.latitude, 0) / all.length, longitude: all.reduce((s, c) => s + c.longitude, 0) / all.length };
  const km = distanceKm(center, cell);
  if (km < CENTRAL_KM) return `central ${city}`;
  const dx = (cell.longitude - center.longitude) * Math.cos(rad(center.latitude));
  const dy = cell.latitude - center.latitude;
  const octant = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
  return `${COMPASS[octant]} of the ${city} centre, about ${Math.round(km)} km out`;
}

/** Candidate hotspots kept before naming: several are lost to airports, industrial land and cells nobody can name. */
export const HEATMAP_CANDIDATES = 10;

/**
 * Hotspot candidates for a city. With a known centre only cells within its radius count: Qloo's heatmap for "New York"
 * ranks Rochester and Buffalo first, and London's and Chicago's include their airports.
 */
export function heatmapDraft(base: Base, r: QlooResult<HeatmapCell>, city: string, centre?: CityCentre): EvidenceDraft {
  if (r.data.length === 0) return empty(base, r.warning);
  const inCity = centre ? r.data.filter((c) => distanceKm({ latitude: centre.lat, longitude: centre.lon }, c) <= centre.radiusKm) : r.data;
  if (inCity.length === 0) return empty(base, `Every hotspot Qloo returned lies more than ${centre?.radiusKm} km from the ${city} centre.`);
  const cells = spreadHotspots(inCity, HEATMAP_CANDIDATES);
  const entities = compactEntities(
    cells.map((c) => ({
      id: c.geohash,
      name: c.name ?? `${UNNAMED_AREA_PREFIX}${c.latitude.toFixed(3)}, ${c.longitude.toFixed(3)}`,
      affinity: c.affinity,
      note: describeOffset(c, inCity, city, centre),
      lat: Math.round(c.latitude * 1e5) / 1e5,
      lon: Math.round(c.longitude * 1e5) / 1e5,
    })),
    HEATMAP_CANDIDATES,
  );
  const top = entities.slice(0, 3).map((e) => e.name).join(", ");
  return { ...base, summary: `${inCity.length} heatmap hotspots in ${city}; hottest: ${top}`, entities };
}

/** The heatmap record with some hotspots removed: count and "hottest" names follow the remaining ones. */
export function withHeatmapEntities<T extends { readonly summary: string; readonly entities?: readonly EvidenceEntity[] }>(
  heat: T,
  entities: readonly EvidenceEntity[],
  whenEmpty = "Every hotspot was set aside by your feedback.",
): T {
  const removed = (heat.entities?.length ?? 0) - entities.length;
  if (entities.length === 0) {
    return { ...heat, entities: [], summary: `No results. ${whenEmpty}` };
  }
  const total = Number(/^(\d+) heatmap hotspots/.exec(heat.summary)?.[1] ?? NaN);
  const top = entities.slice(0, 3).map((e) => e.name).join(", ");
  const counted = Number.isNaN(total) ? heat.summary : heat.summary.replace(/^\d+ heatmap hotspots/, `${Math.max(total - removed, entities.length)} heatmap hotspots`);
  return { ...heat, entities, summary: counted.replace(/hottest: .*$/, `hottest: ${top}`) };
}

/** Qloo reports a weekly popularity rank (1 is best, newest first): a falling number means rising popularity. */
function trendLine(points: readonly TrendPoint[]): string {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const change = (first.populationRank ?? 0) - (last.populationRank ?? 0);
  const direction = change > 0 ? "rising" : change < 0 ? "falling" : "flat";
  const rank = last.populationRank !== undefined ? `, now rank ${last.populationRank}` : "";
  return `popularity ${direction}${rank} (${first.date} to ${last.date})`;
}

export function trendingDraft(base: Base, r: QlooResult<TrendPoint>): EvidenceDraft {
  if (r.data.length === 0) return empty(base, r.warning);
  const byEntity = new Map<string | undefined, TrendPoint[]>();
  for (const pt of r.data) byEntity.set(pt.entityId, [...(byEntity.get(pt.entityId) ?? []), pt]);
  const lines = [...byEntity.values()].map(trendLine);
  return { ...base, summary: `${r.data.length} trend points; ${lines.join("; ")}` };
}
