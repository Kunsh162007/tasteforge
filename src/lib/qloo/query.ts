import {
  SPECIAL_TYPES,
  type DemographicsParams,
  type EntityTagsParams,
  type HeatmapParams,
  type InsightsParams,
  type SearchParams,
  type TagSearchParams,
  type TrendingParams,
} from "./types";

/**
 * Pure builders for Qloo request paths + query strings.
 * Qloo silently ignores unknown parameters, so every name here is asserted in query.test.ts.
 */

type Scalar = string | number | boolean | undefined;
type ParamValue = Scalar | readonly string[];

const MAX_TAKE = 50;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isBlank(v: ParamValue): boolean {
  if (v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  return typeof v === "string" && v.trim() === "";
}

function encodeValue(v: string): string {
  // Keep URNs and comma lists readable; everything else is percent-encoded.
  return encodeURIComponent(v).replace(/%3A/gi, ":").replace(/%2C/gi, ",");
}

function toQuery(path: string, params: Readonly<Record<string, ParamValue>>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => !isBlank(v))
    .map(([k, v]) => {
      const raw = Array.isArray(v) ? v.join(",") : String(v);
      return `${k}=${encodeValue(raw)}`;
    });
  return parts.length === 0 ? path : `${path}?${parts.join("&")}`;
}

function clampTake(take: number | undefined): number | undefined {
  if (take === undefined) return undefined;
  if (!Number.isFinite(take) || take < 1) {
    throw new Error("take must be a positive number");
  }
  return Math.min(Math.floor(take), MAX_TAKE);
}

function hasItems(list: readonly string[] | undefined): boolean {
  return (list?.length ?? 0) > 0;
}

function assertPriceRange(min: number | undefined, max: number | undefined): void {
  const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= 4;
  if ((min !== undefined && !inRange(min)) || (max !== undefined && !inRange(max))) {
    throw new Error("price level must be an integer from 1 to 4");
  }
  if (min !== undefined && max !== undefined && min > max) {
    throw new Error("price level min cannot exceed max");
  }
}

export function searchQuery(p: SearchParams): string {
  if (p.query.trim() === "") throw new Error("search query is required");
  return toQuery("/search", { query: p.query, types: p.types, take: clampTake(p.take) });
}

export function tagsQuery(p: TagSearchParams): string {
  if (p.query.trim() === "") throw new Error("tag search query is required");
  // verified live 2026-10-20: tag search text param is `filter.query`.
  return toQuery("/v2/tags", {
    "filter.query": p.query,
    "filter.tag.types": p.tagTypes,
    take: clampTake(p.take),
  });
}

export function insightsQuery(p: InsightsParams): string {
  const hasSignal =
    hasItems(p.entities) ||
    hasItems(p.tags) ||
    hasItems(p.filterTags) ||
    (p.locationQuery ?? "").trim() !== "";
  if (!hasSignal) {
    throw new Error("insights needs at least one signal or filter (entities, tags, location)");
  }
  assertPriceRange(p.priceMin, p.priceMax);
  return toQuery("/v2/insights", {
    "filter.type": p.type,
    "signal.interests.entities": p.entities,
    "signal.interests.tags": p.tags,
    "filter.location.query": p.locationQuery,
    "signal.location.query": p.signalLocationQuery,
    "filter.tags": p.filterTags,
    "filter.exclude.tags": p.excludeTags,
    "filter.exclude.entities": p.excludeEntities,
    "filter.price_level.min": p.priceMin,
    "filter.price_level.max": p.priceMax,
    "filter.results.entities": p.resultsEntities,
    "feature.explainability": p.explainability ? true : undefined,
    take: clampTake(p.take),
  });
}

export function demographicsQuery(p: DemographicsParams): string {
  if (!hasItems(p.entities) && !hasItems(p.tags)) {
    throw new Error("demographics needs an entity or tag signal");
  }
  return toQuery("/v2/insights", {
    "filter.type": SPECIAL_TYPES.demographics,
    "signal.interests.entities": p.entities,
    "signal.interests.tags": p.tags,
  });
}

export function entityTagsQuery(p: EntityTagsParams): string {
  if (!hasItems(p.entities)) throw new Error("entity tag analysis needs at least one entity");
  return toQuery("/v2/insights", {
    "filter.type": SPECIAL_TYPES.tag,
    "signal.interests.entities": p.entities,
    "filter.tag.types": p.tagTypes,
    "filter.parents.types": p.parentTypes,
    take: clampTake(p.take),
  });
}

/**
 * verified live 2026-10-20: output.heatmap.boundary only accepts urn:geohash (default) or urn:entity:locality.
 * The locality form returns bare borough entities with ~30 MB of polygons and no coordinates, so it is not used:
 * hotspots are geohash cells that the pipeline names by reverse geocoding.
 */
export function heatmapQuery(p: HeatmapParams): string {
  if (p.locationQuery.trim() === "") throw new Error("heatmap needs a location query");
  if (!hasItems(p.entities) && !hasItems(p.tags)) {
    throw new Error("heatmap needs an entity or tag signal");
  }
  return toQuery("/v2/insights", {
    "filter.type": SPECIAL_TYPES.heatmap,
    "filter.location.query": p.locationQuery,
    "signal.interests.entities": p.entities,
    "signal.interests.tags": p.tags,
  });
}

/** verified live 2026-10-20: /v2/trending accepts exactly one entity, and returns nothing for windows under ~173 days. */
export function trendingQuery(p: TrendingParams): string {
  if (p.entities.length !== 1) throw new Error("trending takes exactly one entity per request");
  if (!DATE_RE.test(p.startDate) || !DATE_RE.test(p.endDate) || p.startDate > p.endDate) {
    throw new Error("trending dates must be YYYY-MM-DD with start date <= end date");
  }
  return toQuery("/v2/trending", {
    "filter.type": p.type,
    "signal.interests.entities": p.entities,
    "filter.start_date": p.startDate,
    "filter.end_date": p.endDate,
    take: clampTake(p.take),
  });
}
