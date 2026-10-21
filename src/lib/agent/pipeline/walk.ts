import type { SectionKey } from "../events";
import type { Evidence } from "../ledger";
import { NO_EXCLUSIONS, type Exclusions } from "../refine/plan";
import { isUnnamedArea, withHeatmapEntities, withTags } from "../summaries";
import { ENTITY_TYPES, type QlooEntity } from "@/lib/qloo";
import type { EvidenceEntity } from "../ledger";
import { isUsable, noteFilled, raceTimeout, replaceEvidence, setGuard, viaTool, type PipelineCtx } from "./context";
import { nameAreaFromPlaces, type NearbyPlace } from "./areaNames";
import { scrubEntities } from "./guard";
import { ledgerEntities } from "./minimum";
import { baselineShares, menuTags, rankStyleTags } from "./placeFacts";
import type { Signals } from "./resolve";
import { signalArgsFor, venueTagIds } from "./routing";
import { executeTool } from "../tools";
import { EMPTY_LEDGER } from "../ledger";

/** Stage 3: the plan section 4 graph walk, one parallel branch per brief section. */

/** Section lists in the brief hold at most 6 items; a few spare cover seed echoes and off-city places that get scrubbed. */
const INSIGHT_TAKE = 10;
const LIST_TAKE = 8;
/** How long optional work (trending, extra TV, hotspot names) may keep running once the core walk has finished. */
export const OPTIONAL_BUDGET_MS = 4_000;
/** The city baseline only sharpens style tags; it gets this long after the style tags arrived, then the pooled order is kept. */
const BASELINE_WAIT_MS = 3_000;
const TOP_PLACES_FOR_TAGS = 5;
const TOP_ARTISTS_FOR_TREND = 3;
const DECOR_AMBIENCE_TYPES = ["urn:tag:decor:qloo", "urn:tag:ambience:qloo"];
/** verified live 2026-10-20: entity tag analysis returns data for these families on café and restaurant results. */
const CUISINE_TYPES = ["urn:tag:cuisine:qloo", "urn:tag:specialty_dish:place", "urn:tag:genre:place:restaurant"];
/** Fewer places than this from a venue-filtered query means the filter is too narrow for the city. */
const MIN_FILTERED_PLACES = 3;
/** Fewer re-ranked tags than this and Qloo's pooled order is kept. */
const MIN_SHARP_TAGS = 3;
const STYLE_TAG_LIMIT = 15;
const MENU_TAG_LIMIT = 10;
/** A style tag on more than this share of the city's ordinary places is generic. */
const GENERIC_SHARE = 0.5;

/** Insights arguments that keep disliked entities and tags out of the results (refine loop). */
function excludeArgs(x: Exclusions): Record<string, readonly string[]> {
  return {
    ...(x.entityIds.length > 0 ? { exclude_entity_ids: x.entityIds } : {}),
    ...(x.tagIds.length > 0 ? { exclude_tag_ids: x.tagIds } : {}),
  };
}

const topIds = (e: Evidence | undefined, n: number): string[] => (e?.entities ?? []).slice(0, n).map((x) => x.id);

/**
 * verified live 2026-10-21: `signal.location.query` weights the taste signal toward people in that place. Without it the
 * Indore indie brief got Kings of Leon and The Black Keys; with it, Prateek Kuhad and The Local Train. Artist, brand, film and
 * TV picks carry it whenever a city is known.
 */
const localArgs = (city: string | undefined): Record<string, string> => (city ? { signal_location: city } : {});

async function walkAudience(ctx: PipelineCtx, s: Signals, city: string | undefined, x: Exclusions): Promise<void> {
  const noTagExclusions = excludeArgs({ ...x, tagIds: [] });
  await Promise.all([
    viaTool(ctx, "audience", "qloo_insights", { type: "movie", ...signalArgsFor("movie", s), ...localArgs(city), ...noTagExclusions, take: 8 }),
    viaTool(ctx, "audience", "qloo_insights", { type: "tv_show", ...signalArgsFor("tv_show", s), ...localArgs(city), ...noTagExclusions, take: 6 }, { optional: true }),
    viaTool(ctx, "audience", "qloo_demographics", signalArgsFor("demographics", s)),
  ]);
}

/** Whether any of the seeds was resolved as an artist (a seed run from a preset has no search records and counts as one). */
export function hasArtistSeed(ctx: PipelineCtx, s: Pick<Signals, "entityIds">): boolean {
  if (s.entityIds.length === 0) return false;
  const searches = ctx.box.ledger.records.filter((r) => r.endpoint === "/search");
  if (searches.length === 0) return true;
  return searches.some((r) => r.params.types === "artist" && (r.entities ?? []).some((e) => s.entityIds.includes(e.id)));
}

/**
 * verified live 2026-10-21: seed brands and places (Blue Bottle, Muji) drag an artist query back to global indie, while the
 * music-genre tags alone with `signal.location.query` return the city's own acts (Prateek Kuhad, The Local Train). So with a city,
 * music tags and no artist among the seeds, the artist query is tags plus location.
 */
export function artistSignal(ctx: PipelineCtx, s: Signals, city: string | undefined): Record<string, readonly string[]> {
  const all = signalArgsFor("artist", s);
  if (!city || !all.tag_ids || hasArtistSeed(ctx, s)) return all;
  return { tag_ids: all.tag_ids };
}

async function walkSound(ctx: PipelineCtx, s: Signals, city: string | undefined, x: Exclusions): Promise<void> {
  const artists = await viaTool(ctx, "sound", "qloo_insights", {
    type: "artist",
    ...artistSignal(ctx, s, city),
    ...localArgs(city),
    ...excludeArgs({ ...x, tagIds: [] }),
    take: LIST_TAKE,
  });
  const ids = topIds(artists, TOP_ARTISTS_FOR_TREND);
  // Trending only colours a sentence; it never holds the brief back.
  if (ids.length > 0) void viaTool(ctx, "sound", "qloo_trending", { type: "artist", entity_ids: ids }, { optional: true });
}

const BASELINE_PLACES = 20;
const MIN_BASELINE_PLACES = 5;

/** The city's ordinary places (same venue type when known): what "everyone has" looks like. Never rejects. */
async function cityBaseline(ctx: PipelineCtx, city: string, venue: readonly string[]): Promise<Map<string, number>> {
  const ask = (filterTags?: readonly string[]) =>
    ctx.qloo.insights({ type: ENTITY_TYPES.place, locationQuery: city, take: BASELINE_PLACES, ...(filterTags ? { filterTags } : {}) });
  try {
    let r = await ask(venue.length > 0 ? venue : undefined);
    if (venue.length > 0 && r.data.length < MIN_BASELINE_PLACES) r = await ask();
    const { kept } = scrubEntities(r.data.map(toEntity), ctx.guard.current, true);
    return baselineShares(r.data.filter((e) => kept.some((k) => k.id === e.id)));
  } catch {
    return new Map();
  }
}

const toEntity = (e: QlooEntity): EvidenceEntity => ({
  id: e.id,
  name: e.name,
  ...(e.location ? { lat: e.location.latitude, lon: e.location.longitude } : {}),
});

/** Style tags re-ranked by how specific they are to the top places; Qloo's pooled order stays as the fallback. */
function sharpenStyle(ctx: PipelineCtx, ev: Evidence | undefined, ids: readonly string[], baseline: ReadonlyMap<string, number>): void {
  if (!ev || baseline.size === 0) return;
  const ranked = rankStyleTags(ids, ctx.facts, baseline);
  const taken = new Set(ranked.map((t) => t.id));
  const rest = (ev.tags ?? []).filter((t) => !taken.has(t.id) && (baseline.get(t.id) ?? 0) <= GENERIC_SHARE);
  const sharpened = [...ranked, ...rest].slice(0, STYLE_TAG_LIMIT);
  if (sharpened.length >= MIN_SHARP_TAGS) replaceEvidence(ctx, withTags(ev, sharpened));
}

/** Menu tags: the places' own signature dishes and cuisines first, then whatever Qloo's tag pool added. */
function sharpenMenu(ctx: PipelineCtx, ev: Evidence | undefined, ids: readonly string[]): void {
  if (!ev) return;
  const own = menuTags(ids, ctx.facts);
  if (own.length < MIN_SHARP_TAGS) return;
  const names = new Set(own.map((t) => t.name.toLowerCase()));
  const rest = (ev.tags ?? []).filter((t) => !names.has(t.name.toLowerCase()) && t.name.length > 3);
  const had = isUsable(ev);
  replaceEvidence(ctx, withTags(ev, [...own, ...rest].slice(0, MENU_TAG_LIMIT)));
  if (!had) noteFilled(ctx, "pairings", own.length);
}

type PlaceQuery = Record<string, unknown>;

/**
 * A broader version of the place query to run alongside it: the venue filter dropped, or else the last (most
 * specific) concept tag dropped. undefined when there is nothing to drop.
 */
function widenedPlaceQuery(query: PlaceQuery, venue: readonly string[]): PlaceQuery | undefined {
  if (venue.length > 0) return query;
  const tags = (query.tag_ids as readonly string[] | undefined) ?? [];
  if (tags.length < 2) return undefined;
  return { ...query, tag_ids: tags.slice(0, -1) };
}

/** Starts a query for its side effect (the client shares in-flight and cached answers); nothing is recorded. */
function prefetch(ctx: PipelineCtx, query: PlaceQuery): void {
  void executeTool({ name: "qloo_insights", args: query }, { qloo: ctx.qloo, ledger: EMPTY_LEDGER, now: ctx.now }).catch(() => undefined);
}

const isThin = (e: Evidence | undefined): boolean => (e?.entities?.length ?? 0) < MIN_FILTERED_PLACES;

async function walkPlaces(ctx: PipelineCtx, s: Signals, city: string, x: Exclusions): Promise<void> {
  const query: PlaceQuery = { type: "place", ...signalArgsFor("place", s), ...excludeArgs(x), location: city, take: INSIGHT_TAKE };
  const venue = venueTagIds(s.tagIds);
  const primary = venue.length > 0 ? { ...query, filter_tag_ids: venue } : query;
  const widened = widenedPlaceQuery(query, venue);
  // The widened query runs beside the first one, so a thin answer costs no extra round trip.
  const first = viaTool(ctx, "aesthetic", "qloo_insights", primary);
  if (widened) prefetch(ctx, widened);
  const baseline = cityBaseline(ctx, city, venue);
  let places = await first;
  if (widened && isThin(places)) places = await viaTool(ctx, "aesthetic", "qloo_insights", widened);
  const ids = topIds(places, TOP_PLACES_FOR_TAGS);
  if (ids.length === 0) return;
  const [style, menu] = await Promise.all([
    viaTool(ctx, "aesthetic", "qloo_entity_tags", { entity_ids: ids, tag_types: DECOR_AMBIENCE_TYPES, take: 15 }),
    viaTool(ctx, "pairings", "qloo_entity_tags", { entity_ids: ids, tag_types: CUISINE_TYPES, take: 10 }),
  ]);
  const shares = await raceValue(baseline, BASELINE_WAIT_MS);
  if (shares) sharpenStyle(ctx, style, ids, shares);
  sharpenMenu(ctx, menu, ids);
}

/** The value of `work`, or undefined if it takes longer than `ms`. */
async function raceValue<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

async function walkPairings(ctx: PipelineCtx, s: Signals, city: string | undefined, x: Exclusions): Promise<void> {
  await viaTool(ctx, "pairings", "qloo_insights", { type: "brand", ...signalArgsFor("brand", s), ...localArgs(city), ...excludeArgs({ ...x, tagIds: [] }), take: LIST_TAKE });
}

/** Hotspots shown per brief, and how many candidates are checked to find that many real neighbourhoods. */
const MAX_HOTSPOTS = 5;
const CANDIDATES_TO_CHECK = 8;
/** The reference places give Qloo-based hotspot names; wait this long for them before falling back to the geocoder alone. */
const PLACES_WAIT_MS = 12_000;

const NOTHING_NAMEABLE = "None of the hotspot cells could be given a neighbourhood name (or they lay at an airport or on industrial land).";

const lower = (s: string): string => s.trim().toLowerCase();

/** A country or region is never a neighbourhood (a London cell once came back as "United Kingdom"). */
const WIDER_AREAS = new Set(["united kingdom", "united states", "england", "scotland", "wales", "greater london", "india", "france", "usa", "new york state", "illinois", "madhya pradesh", "ile-de-france", "île-de-france"]);

/** The bare city, "City of X" or "X City" says nothing about where in the city; "Brooklyn Heights" does. */
function isGenericCityName(name: string, city: string): boolean {
  const n = lower(name);
  const c = lower(city);
  return n === c || n === `${c} city` || n === `city of ${c}` || n === `${c} district` || n === `${c} division` || WIDER_AREAS.has(n);
}

function isSpecificName(name: string, city: string, taken: readonly { readonly name: string }[]): boolean {
  return !isGenericCityName(name, city) && !taken.some((e) => lower(e.name) === lower(name));
}

/** Top reference places with a position and a street address: what hotspots are named from. */
function placesWithAddress(ctx: PipelineCtx): NearbyPlace[] {
  return ledgerEntities(ctx.box.ledger, "place").flatMap(({ entity }) => {
    const address = ctx.facts.get(entity.id)?.address;
    return address && entity.lat !== undefined && entity.lon !== undefined ? [{ id: entity.id, lat: entity.lat, lon: entity.lon, address }] : [];
  });
}

/**
 * Turns hotspot candidates into the hotspots shown. A cell is kept only with a real neighbourhood name: Qloo's own data
 * comes first (the area its nearest reference places name in their addresses, "Vijay Nagar"), then reverse geocoding
 * (best effort, serial and cached). Cells at airports or on industrial land (where OpenStreetMap says so) and cells
 * nothing can name are dropped: the brief never shows raw coordinates.
 */
async function nameHotspots(ctx: PipelineCtx, heat: Evidence, city: string, placesReady: Promise<unknown> | undefined): Promise<void> {
  const candidates = heat.entities;
  if (!candidates || candidates.length === 0) return;
  if (placesReady) await raceValue(placesReady, PLACES_WAIT_MS);
  const places = placesWithAddress(ctx);
  const kept: EvidenceEntity[] = [];
  for (const e of candidates.slice(0, CANDIDATES_TO_CHECK)) {
    if (kept.length === MAX_HOTSPOTS) break;
    if (e.lat === undefined || e.lon === undefined) continue;
    const area = ctx.geocode ? await ctx.geocode(e.lat, e.lon) : undefined;
    if (area && !area.residential) continue;
    const taken = new Set(kept.map((k) => lower(k.name)));
    let name = isUnnamedArea(e.name) ? nameAreaFromPlaces({ lat: e.lat, lon: e.lon }, places, city, taken) : e.name;
    // verified live 2026-10-20: OpenStreetMap often only knows the city district ("Indore City"); a generic or repeated name says nothing.
    if (!name && area && isSpecificName(area.name, city, kept)) name = area.name;
    if (name) kept.push({ ...e, name });
  }
  replaceEvidence(ctx, withHeatmapEntities(heat, kept, NOTHING_NAMEABLE));
}

/** Drops hotspots the user disliked (heatmap has no exclude parameter, so this is done after the call). */
function withoutCells(ctx: PipelineCtx, heat: Evidence, cellIds: readonly string[]): Evidence {
  if (cellIds.length === 0 || !heat.entities) return heat;
  const kept = withHeatmapEntities(heat, heat.entities.filter((e) => !cellIds.includes(e.id)));
  replaceEvidence(ctx, kept);
  return kept;
}

async function walkWhere(ctx: PipelineCtx, s: Signals, city: string, x: Exclusions, placesReady: Promise<unknown> | undefined): Promise<void> {
  const heat = await viaTool(ctx, "where", "qloo_heatmap", { location: city, ...signalArgsFor("heatmap", s) });
  if (heat) await nameHotspots(ctx, withoutCells(ctx, heat, x.cellIds), city, placesReady).catch(() => undefined);
}

export type WalkOptions = {
  /** Leave optional work running; the caller ends it with `closeRun`. */
  readonly deferOptional?: boolean;
  /** Epoch ms after which the walk stops waiting for the remaining core calls and reports a partial result. */
  readonly deadlineAt?: number;
};

export type WalkOutcome = {
  /** true: the deadline passed with core calls still running; the brief is built from what arrived. */
  readonly partial: boolean;
};

/** Runs every section branch in parallel. Place-based sections only run when a city is known. */
export async function walkGraph(ctx: PipelineCtx, signals: Signals, city: string | undefined, opts: WalkOptions = {}): Promise<WalkOutcome> {
  return walkSections(ctx, ["audience", "sound", "pairings", "aesthetic", "where"], signals, city, NO_EXCLUSIONS, opts);
}

/**
 * Walks only the given sections in parallel (the full brief, or just the sections a refine run touches).
 * Pairings also need the places walk for cuisine tags, so it runs for either section.
 * The longest chain (places, then their tags) starts first so it is not queued behind the short calls.
 */
export async function walkSections(
  ctx: PipelineCtx,
  sections: readonly SectionKey[],
  signals: Signals,
  city: string | undefined,
  x: Exclusions,
  opts: WalkOptions = {},
): Promise<WalkOutcome> {
  setGuard(ctx, signals, city);
  const has = (k: SectionKey): boolean => sections.includes(k);
  const branches: Promise<void>[] = [];
  const places = city && (has("aesthetic") || has("pairings")) ? walkPlaces(ctx, signals, city, x) : undefined;
  if (places) branches.push(places);
  if (city && has("where")) branches.push(walkWhere(ctx, signals, city, x, places));
  if (has("audience")) branches.push(walkAudience(ctx, signals, city, x));
  if (has("sound")) branches.push(walkSound(ctx, signals, city, x));
  if (has("pairings")) branches.push(walkPairings(ctx, signals, city, x));
  const core = Promise.all(branches);
  if (opts.deadlineAt === undefined) await core;
  const outcome = opts.deadlineAt === undefined ? "done" : await raceTimeout(core, opts.deadlineAt - Date.now());
  // Refine and compare have no later stage to overlap with, so they give optional work a short grace period here.
  if (!opts.deferOptional && outcome === "done") await raceTimeout(Promise.allSettled(ctx.optional), OPTIONAL_BUDGET_MS);
  return { partial: outcome === "timeout" };
}
