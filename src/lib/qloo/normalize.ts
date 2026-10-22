import { entityImage, entityNote } from "./describe";
import { displayName } from "./displayName";
import type {
  Demographics,
  HeatmapCell,
  QlooEntity,
  QlooLocation,
  QlooResult,
  QlooTag,
  TrendPoint,
} from "./types";

/** Tolerant readers: Qloo payloads vary by entity type, so every field is optional. */

type Obj = Readonly<Record<string, unknown>>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const arr = (v: unknown): readonly unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});

/** Drops undefined keys so normalized objects stay compact and comparable. */
function compact<T extends Obj>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

// Verbose fields with no use for briefs.
const DROPPED_PROPERTIES = new Set(["akas", "short_descriptions"]);

function results(body: unknown): Obj {
  return obj(obj(body).results);
}

function numberMap(v: unknown): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(obj(v))) {
    const n = num(val);
    if (n !== undefined) out[k] = n;
  }
  return out;
}

/** Tag search lists the entity kinds a tag applies to as `parents: [{ type: "urn:entity:place" }]` (verified live 2026-10-20). */
function tagEntityTypes(parents: unknown): readonly string[] | undefined {
  const kinds = arr(parents)
    .map((p) => str(obj(p).type)?.split(":").pop())
    .filter((k): k is string => k !== undefined);
  return kinds.length > 0 ? kinds : undefined;
}

export function normalizeTag(raw: unknown): QlooTag | undefined {
  const t = obj(raw);
  const id = str(t.tag_id) ?? str(t.id) ?? str(t.tag_value);
  if (!id) return undefined;
  return compact({
    id,
    name: displayName(str(t.name), id),
    type: str(t.type) ?? str(t.subtype),
    score: num(obj(t.query).affinity) ?? num(t.score),
    entityTypes: tagEntityTypes(t.parents),
  });
}

function normalizeLocation(raw: unknown): QlooLocation | undefined {
  const l = obj(raw);
  const latitude = num(l.latitude) ?? num(l.lat);
  const longitude = num(l.longitude) ?? num(l.lon) ?? num(l.lng);
  return latitude === undefined || longitude === undefined ? undefined : { latitude, longitude };
}

function normalizeProperties(raw: unknown): Obj | undefined {
  const entries = Object.entries(obj(raw)).filter(([k]) => !DROPPED_PROPERTIES.has(k));
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

export function normalizeEntity(raw: unknown): QlooEntity | undefined {
  const e = obj(raw);
  const id = str(e.entity_id) ?? str(e.id);
  if (!id) return undefined;
  const props = obj(e.properties);
  const tags = arr(e.tags).map(normalizeTag).filter((t): t is QlooTag => t !== undefined);
  const type = str(e.subtype) ?? str(e.type) ?? "urn:entity";
  const kinds = arr(e.types)
    .map((t) => str(t)?.split(":").pop())
    .filter((k): k is string => k !== undefined);
  return compact({
    id,
    name: displayName(str(e.name), id),
    type,
    kinds: kinds.length > 0 ? kinds : undefined,
    note: entityNote(type, props),
    image: entityImage(props),
    affinity: num(obj(e.query).affinity),
    popularity: num(e.popularity),
    tags: tags.length > 0 ? tags : undefined,
    location: normalizeLocation(e.location) ?? normalizeLocation(props.geocode),
    properties: normalizeProperties(props),
  });
}

function defined<T>(list: readonly (T | undefined)[]): readonly T[] {
  return list.filter((x): x is T => x !== undefined);
}

export function normalizeEntities(body: unknown): readonly QlooEntity[] {
  const r = obj(obj(body).results);
  const rawList = Array.isArray(obj(body).results) ? arr(obj(body).results) : arr(r.entities);
  return defined(rawList.map(normalizeEntity));
}

export function normalizeTags(body: unknown): readonly QlooTag[] {
  return defined(arr(results(body).tags).map(normalizeTag));
}

export function normalizeDemographics(body: unknown): readonly Demographics[] {
  return defined(
    arr(results(body).demographics).map((raw) => {
      const d = obj(raw);
      const entityId = str(d.entity_id);
      if (!entityId) return undefined;
      const q = obj(d.query);
      return { entityId, age: numberMap(q.age), gender: numberMap(q.gender) };
    }),
  );
}

export function normalizeHeatmap(body: unknown): readonly HeatmapCell[] {
  return defined(
    arr(results(body).heatmap).map((raw) => {
      const c = obj(raw);
      const loc = obj(c.location);
      const q = obj(c.query);
      // verified live 2026-10-20: cells carry location.{latitude,longitude,geohash} and query.affinity, no area name.
      // The name lookup stays for sources that do add one; the pipeline otherwise names cells by reverse geocoding.
      const name = str(loc.name) ?? str(c.name);
      const point = normalizeLocation(loc);
      const geohash = str(loc.geohash) ?? (name ? `area:${name}` : undefined);
      const affinity = num(q.affinity);
      if (!geohash || !point || affinity === undefined) return undefined;
      return compact({
        geohash,
        name,
        ...point,
        affinity,
        affinityRank: num(q.affinity_rank),
        popularity: num(q.popularity),
      });
    }),
  );
}

/** Trending ranks arrive as numeric strings ("693") from the live API. */
const numish = (v: unknown): number | undefined => num(v) ?? (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);

export function normalizeTrending(body: unknown): readonly TrendPoint[] {
  return defined(
    arr(results(body).trending).map((raw) => {
      const t = obj(raw);
      const date = str(t.date);
      if (!date) return undefined;
      return compact({
        date,
        populationPercentile: num(t.population_percentile),
        populationRank: numish(t.population_rank),
        rankVelocity: numish(t.population_rank_velocity),
        velocityFoldChange: num(t.velocity_fold_change),
        percentDelta: num(t.population_percent_delta),
      });
    }),
  );
}

export function withEmptyWarning<T>(data: readonly T[], what: string): QlooResult<T> {
  if (data.length > 0) return { data };
  return {
    data,
    warning:
      `Qloo returned no results for ${what}. Qloo silently ignores invalid params: ` +
      "check filter.type, parameter names for that type, and location/entity coverage.",
  };
}
