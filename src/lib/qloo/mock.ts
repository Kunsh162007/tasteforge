import { ALL_ENTITIES, ENTITIES_BY_TYPE, type RawEntity, type RawTag } from "./fixtures/entities";
import { MAINSTREAM_ENTITIES } from "./fixtures/mainstream";
import { tagMatchScore } from "./fixtures/synonyms";
import { mockDemographics, mockHeatmap, mockTrending } from "./fixtures/geo";

/**
 * Mock mode: a fetch implementation serving SYNTHETIC, clearly fake data shaped like
 * real Qloo responses. It goes through the same URL building and normalization as live
 * mode, so the whole client path is exercised without a key.
 */

type Params = URLSearchParams;

const list = (p: Params, name: string): string[] =>
  (p.get(name) ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Locations with no mock coverage, so empty-result handling can be exercised.
const UNCOVERED_LOCATION = /atlantis|nowhere/i;

function toRaw(e: RawEntity, explain: string[] | undefined) {
  return {
    entity_id: e.entity_id,
    name: e.name,
    type: "urn:entity",
    subtype: e.subtype,
    popularity: e.popularity,
    tags: e.tags,
    properties: e.properties,
    ...(e.location ? { location: e.location } : {}),
    query: {
      affinity: e.affinity,
      ...(explain ? { explainability: { entities: explain.map((id) => ({ entity_id: id, score: 0.5 })) } } : {}),
    },
  };
}

function hasTag(e: RawEntity, id: string): boolean {
  return e.tags.some((t) => t.id === id);
}

function priceOk(e: RawEntity, p: Params): boolean {
  const level = e.properties.price_level;
  if (typeof level !== "number") return true;
  const min = Number(p.get("filter.price_level.min") ?? 1);
  const max = Number(p.get("filter.price_level.max") ?? 4);
  return level >= min && level <= max;
}

/** Entities reachable by name or id: the regular fixtures plus the mainstream names. */
const SEARCHABLE: RawEntity[] = [...ALL_ENTITIES, ...MAINSTREAM_ENTITIES];

/** filter.results.entities: Qloo scores exactly the supplied shortlist (unknown ids are omitted). */
function scoreShortlist(type: string, ids: string[], p: Params): Response {
  const explain = p.get("feature.explainability") === "true" ? list(p, "signal.interests.entities") : undefined;
  const found = ids
    .map((id) => SEARCHABLE.find((e) => e.entity_id === id && e.subtype === type))
    .filter((e): e is RawEntity => e !== undefined);
  return json({ success: true, results: { entities: found.map((e) => toRaw(e, explain)) } });
}

function entityInsights(type: string, p: Params): Response {
  const shortlist = list(p, "filter.results.entities");
  if (shortlist.length > 0) return scoreShortlist(type, shortlist, p);
  const want = list(p, "filter.tags");
  const exclude = list(p, "filter.exclude.tags");
  const excludeIds = list(p, "filter.exclude.entities");
  const location = p.get("filter.location.query") ?? "";
  const explain = p.get("feature.explainability") === "true" ? list(p, "signal.interests.entities") : undefined;
  const take = Number(p.get("take") ?? 20);
  const found = UNCOVERED_LOCATION.test(location)
    ? []
    : (ENTITIES_BY_TYPE[type] ?? [])
        .filter((e) => want.every((t) => hasTag(e, t)))
        .filter((e) => !exclude.some((t) => hasTag(e, t)))
        .filter((e) => !excludeIds.includes(e.entity_id))
        .filter((e) => priceOk(e, p))
        .slice(0, take);
  return json({ success: true, results: { entities: found.map((e) => toRaw(e, explain)) } });
}

function uniqueTags(entities: readonly RawEntity[]): RawTag[] {
  const seen = new Map<string, RawTag>();
  for (const e of entities) for (const t of e.tags) seen.set(t.id, t);
  return [...seen.values()];
}

function rawTag(t: RawTag) {
  return { tag_id: t.id, name: t.name, subtype: t.type, types: ["urn:entity:place"], query: {} };
}

function tagsByType(tags: RawTag[], p: Params): RawTag[] {
  const types = list(p, "filter.tag.types");
  return types.length === 0 ? tags : tags.filter((t) => types.some((ty) => t.type.startsWith(ty)));
}

function tagSearch(p: Params): Response {
  const q = p.get("filter.query") ?? "";
  const matches = tagsByType(uniqueTags(ALL_ENTITIES), p)
    .map((t) => ({ t, score: tagMatchScore(t, q) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((m) => m.t);
  return json({ success: true, results: { tags: matches.slice(0, Number(p.get("take") ?? 20)).map(rawTag) } });
}

function entityTagAnalysis(p: Params): Response {
  const ids = list(p, "signal.interests.entities");
  const pool = ALL_ENTITIES.filter((e) => ids.includes(e.entity_id));
  const tags = tagsByType(uniqueTags(pool), p).slice(0, Number(p.get("take") ?? 20));
  return json({ success: true, results: { tags: tags.map(rawTag) } });
}

function search(p: Params): Response {
  const q = (p.get("query") ?? "").toLowerCase();
  const types = list(p, "types");
  const hits = SEARCHABLE.filter((e) => e.name.toLowerCase().includes(q)).filter(
    (e) => types.length === 0 || types.includes(e.subtype),
  );
  const take = Number(p.get("take") ?? 10);
  return json({ success: true, results: hits.slice(0, take).map((e) => toRaw(e, undefined)) });
}

function insights(p: Params): Response {
  const type = p.get("filter.type") ?? "";
  if (type === "urn:demographics") {
    const ids = [...list(p, "signal.interests.entities"), ...list(p, "signal.interests.tags")];
    return json({ success: true, results: { demographics: mockDemographics(ids) } });
  }
  if (type === "urn:tag") return entityTagAnalysis(p);
  if (type === "urn:heatmap") {
    const location = p.get("filter.location.query") ?? "";
    // The live API returns bare geohash cells; the mock names them so offline demos still read well.
    return json({ success: true, results: { heatmap: UNCOVERED_LOCATION.test(location) ? [] : mockHeatmap(location, true) } });
  }
  if (!ENTITIES_BY_TYPE[type]) {
    return json({ message: `You do not have permission to access ${type}` }, 403);
  }
  return entityInsights(type, p);
}

function trending(p: Params): Response {
  const end = p.get("filter.end_date") ?? "";
  const weeks = Math.min(Number(p.get("take") ?? 4), 12);
  return json({ success: true, results: { trending: mockTrending(end, weeks) } });
}

export function createMockFetch(): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    switch (url.pathname) {
      case "/search":
        return search(url.searchParams);
      case "/v2/tags":
        return tagSearch(url.searchParams);
      case "/v2/insights":
        return insights(url.searchParams);
      case "/v2/trending":
        return trending(url.searchParams);
      default:
        return json({ message: "mock: unknown path" }, 404);
    }
  }) as typeof fetch;
}
