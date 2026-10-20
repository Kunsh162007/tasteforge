import { ENTITY_TYPES, type QlooEntity } from "../types";
import { attempt, httpNote, plural, tagFamilies } from "./helpers";
import { result, type CheckContext, type CheckResult, type SeedNames, type Seeds } from "./types";

/** Plan section 6 / P4 risk checks that depend on seeds resolved from film and artist names. */

export const LIVE_SEED_NAMES: SeedNames = { films: ["Lost in Translation", "Moonlight"], artists: ["Radiohead", "Mitski"] };
export const MOCK_SEED_NAMES: SeedNames = { films: ["Lantern Year", "Small Hours"], artists: ["Velvet Static", "Paper Lanterns"] };
const DECOR_AMBIENCE = ["urn:tag:decor:qloo", "urn:tag:ambience:qloo"];
const GOOD_PLACE_COUNT = 5;
const GOOD_TAG_COUNT = 3;
const TOP_PLACES = 5;

async function firstHit(ctx: CheckContext, query: string, type: string): Promise<QlooEntity | undefined> {
  const r = await attempt(() => ctx.client.search({ query, types: [type], take: 3 }));
  return r.ok ? r.value.data[0] : undefined;
}

function seedResult(id: string, found: readonly QlooEntity[], asked: readonly string[], kind: "film" | "artist"): CheckResult {
  const area = "Seed resolution";
  if (found.length === asked.length) return result(id, area, "PASS", `${found.length}/${asked.length} ${kind} seeds resolved (${found.map((e) => e.name).join(", ")})`);
  const type = kind === "film" ? ENTITY_TYPES.movie : ENTITY_TYPES.artist;
  if (found.length > 0) return result(id, area, "WARN", `${found.length}/${asked.length} ${kind} seeds resolved`, `Check that /search accepts types=${type} and that the seed names exist.`);
  return result(id, area, "FAIL", `no ${kind} seed resolved`, `Check QLOO_API_KEY, QLOO_BASE_URL (hackathon.api.qloo.com) and the /search types value (${type}); nothing downstream can run without seeds.`);
}

export async function resolveSeedEntities(ctx: CheckContext): Promise<{ seeds: Seeds; results: CheckResult[] }> {
  const names = ctx.seedNames ?? (ctx.mode === "mock" ? MOCK_SEED_NAMES : LIVE_SEED_NAMES);
  const films = (await Promise.all(names.films.map((q) => firstHit(ctx, q, ENTITY_TYPES.movie)))).filter((e): e is QlooEntity => e !== undefined);
  const artists = (await Promise.all(names.artists.map((q) => firstHit(ctx, q, ENTITY_TYPES.artist)))).filter((e): e is QlooEntity => e !== undefined);
  return {
    seeds: { films, artists },
    results: [seedResult("search.film", films, names.films, "film"), seedResult("search.artist", artists, names.artists, "artist")],
  };
}

const PLACES_FALLBACK = "P4 fallback: use tag-driven aesthetics (audience tags to place tags) and pick well-covered demo cities (Brooklyn, London).";

async function placesFor(ctx: CheckContext, kind: "film" | "artist", seeds: readonly QlooEntity[], city: string) {
  const id = `places.${kind}.${city}`;
  const area = "Seeds to places";
  if (seeds.length === 0) return { check: result(id, area, "SKIP", `no ${kind} seeds`), places: [] as readonly QlooEntity[] };
  const r = await attempt(() => ctx.client.insights({ type: ENTITY_TYPES.place, entities: seeds.map((s) => s.id), locationQuery: city, take: 10 }));
  if (!r.ok) {
    return { check: result(id, area, "FAIL", `${r.message}${httpNote(r.status)}`, "Verify filter.type=urn:entity:place and filter.location.query for this city."), places: [] };
  }
  const places = r.value.data;
  if (places.length >= GOOD_PLACE_COUNT) return { check: result(id, area, "PASS", `${plural(places.length, "place")} for ${kind} seeds in ${city}`), places };
  if (places.length > 0) return { check: result(id, area, "WARN", `only ${plural(places.length, "place")} in ${city}`, PLACES_FALLBACK), places };
  return { check: result(id, area, "FAIL", `no places in ${city}`, `${PLACES_FALLBACK} For Indore, keep it only if other cities work.`), places };
}

async function decorTags(ctx: CheckContext, city: string, places: readonly QlooEntity[]): Promise<CheckResult> {
  const id = `tags.decor_ambience.${city}`;
  const area = "Decor and ambience tags";
  if (places.length === 0) return result(id, area, "SKIP", `no places in ${city} to read tags from`);
  const ids = places.slice(0, TOP_PLACES).map((p) => p.id);
  const r = await attempt(() => ctx.client.entityTags({ entities: ids, tagTypes: DECOR_AMBIENCE, take: 15 }));
  if (r.ok && r.value.data.length >= GOOD_TAG_COUNT) return result(id, area, "PASS", `${plural(r.value.data.length, "decor/ambience tag")} on the top places in ${city}`);
  const any = await attempt(() => ctx.client.entityTags({ entities: ids, take: 30 }));
  const seen = any.ok ? tagFamilies(any.value.data.map((t) => t.id)) : "none";
  const fix = `Use other place tags (genre, cuisine, ambience variants) for the aesthetic section and label it lower confidence. Tag families on these places: ${seen}.`;
  if (r.ok && r.value.data.length > 0) return result(id, area, "WARN", `only ${plural(r.value.data.length, "decor/ambience tag")} in ${city}`, fix);
  return result(id, area, "FAIL", r.ok ? `no decor/ambience tags in ${city}` : `${r.message}${httpNote(r.status)}`, fix);
}

async function heatmapFor(ctx: CheckContext, city: string, seeds: Seeds): Promise<CheckResult> {
  const id = `heatmap.cells.${city}`;
  const area = "Heatmap cells";
  const entities = [...seeds.artists, ...seeds.films].slice(0, 3).map((e) => e.id);
  if (entities.length === 0) return result(id, area, "SKIP", "no seeds");
  const r = await attempt(() => ctx.client.heatmap({ locationQuery: city, entities }));
  if (!r.ok) return result(id, area, "FAIL", `${r.message}${httpNote(r.status)}`, "Check the heatmap parameters (filter.type=urn:heatmap, filter.location.query, a signal) in heatmapQuery() (src/lib/qloo/query.ts).");
  const cells = r.value.data;
  if (cells.length === 0) return result(id, area, "FAIL", `no heatmap cells for ${city}`, "Pick a better-covered city.");
  const named = cells.filter((c) => c.name);
  // Live heatmaps are bare geohash cells: the pipeline names them with the Nominatim geocoder.
  return result(id, area, "PASS", named.length > 0 ? `${named.length}/${cells.length} cells named (e.g. ${named[0].name})` : `${plural(cells.length, "cell")} with coordinates (named later by the geocoder)`);
}

/** Seeds to places, decor/ambience tags and heatmap naming for every demo city. Also returns a sample of places. */
export async function placeChecks(ctx: CheckContext, seeds: Seeds): Promise<{ results: CheckResult[]; places: readonly QlooEntity[] }> {
  const out: CheckResult[] = [];
  let sample: readonly QlooEntity[] = [];
  for (const city of ctx.cities) {
    const film = await placesFor(ctx, "film", seeds.films, city);
    const artist = await placesFor(ctx, "artist", seeds.artists, city);
    out.push(film.check, artist.check);
    const places = artist.places.length > 0 ? artist.places : film.places;
    if (sample.length === 0) sample = places;
    out.push(await decorTags(ctx, city, places), await heatmapFor(ctx, city, seeds));
  }
  return { results: out, places: sample };
}
