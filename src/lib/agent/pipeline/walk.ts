import type { SectionKey } from "../events";
import type { Evidence } from "../ledger";
import { NO_EXCLUSIONS, type Exclusions } from "../refine/plan";
import { isUnnamedArea, withHeatmapEntities, withTags } from "../summaries";
import { ENTITY_TYPES, type QlooEntity } from "@/lib/qloo";
import type { EvidenceEntity } from "../ledger";
import { isUsable, noteFilled, replaceEvidence, setGuard, viaTool, type PipelineCtx } from "./context";
import { scrubEntities } from "./guard";
import { baselineShares, menuTags, rankStyleTags } from "./placeFacts";
import type { Signals } from "./resolve";
import { signalArgsFor, venueTagIds } from "./routing";

/** Stage 3: the plan section 4 graph walk, one parallel branch per brief section. */

const INSIGHT_TAKE = 10;
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

async function walkAudience(ctx: PipelineCtx, s: Signals, x: Exclusions): Promise<void> {
  const noTagExclusions = excludeArgs({ ...x, tagIds: [] });
  await Promise.all([
    viaTool(ctx, "audience", "qloo_insights", { type: "movie", ...signalArgsFor("movie", s), ...noTagExclusions, take: 8 }),
    viaTool(ctx, "audience", "qloo_insights", { type: "tv_show", ...signalArgsFor("tv_show", s), ...noTagExclusions, take: 6 }),
    viaTool(ctx, "audience", "qloo_demographics", signalArgsFor("demographics", s)),
  ]);
}

async function walkSound(ctx: PipelineCtx, s: Signals, x: Exclusions): Promise<void> {
  const artists = await viaTool(ctx, "sound", "qloo_insights", {
    type: "artist",
    ...signalArgsFor("artist", s),
    ...excludeArgs({ ...x, tagIds: [] }),
    take: INSIGHT_TAKE,
  });
  const ids = topIds(artists, TOP_ARTISTS_FOR_TREND);
  if (ids.length > 0) await viaTool(ctx, "sound", "qloo_trending", { type: "artist", entity_ids: ids });
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

async function walkPlaces(ctx: PipelineCtx, s: Signals, city: string, x: Exclusions): Promise<void> {
  const query = { type: "place", ...signalArgsFor("place", s), ...excludeArgs(x), location: city, take: INSIGHT_TAKE };
  const venue = venueTagIds(s.tagIds);
  const baseline = cityBaseline(ctx, city, venue);
  let places = await viaTool(ctx, "aesthetic", "qloo_insights", venue.length > 0 ? { ...query, filter_tag_ids: venue } : query);
  if (venue.length > 0 && (places?.entities?.length ?? 0) < MIN_FILTERED_PLACES) {
    places = await viaTool(ctx, "aesthetic", "qloo_insights", query);
  }
  const ids = topIds(places, TOP_PLACES_FOR_TAGS);
  if (ids.length === 0) return;
  const [style, menu] = await Promise.all([
    viaTool(ctx, "aesthetic", "qloo_entity_tags", { entity_ids: ids, tag_types: DECOR_AMBIENCE_TYPES, take: 15 }),
    viaTool(ctx, "pairings", "qloo_entity_tags", { entity_ids: ids, tag_types: CUISINE_TYPES, take: 10 }),
  ]);
  sharpenStyle(ctx, style, ids, await baseline);
  sharpenMenu(ctx, menu, ids);
}

async function walkPairings(ctx: PipelineCtx, s: Signals, x: Exclusions): Promise<void> {
  await viaTool(ctx, "pairings", "qloo_insights", { type: "brand", ...signalArgsFor("brand", s), ...excludeArgs({ ...x, tagIds: [] }), take: INSIGHT_TAKE });
}

const HOTSPOTS_TO_NAME = 4;

const lower = (s: string): string => s.trim().toLowerCase();

function isSpecificName(name: string, city: string, taken: readonly { readonly name: string }[]): boolean {
  return !lower(name).includes(lower(city)) && !taken.some((e) => lower(e.name) === lower(name));
}

/** Replaces coordinate-only hotspot names with neighbourhood names (best effort, serial and cached). */
async function nameHotspots(ctx: PipelineCtx, heat: Evidence, city: string): Promise<void> {
  const geocode = ctx.geocode;
  const entities = heat.entities;
  if (!geocode || !entities) return;
  const named = [...entities];
  let changed = false;
  for (let i = 0; i < Math.min(named.length, HOTSPOTS_TO_NAME); i += 1) {
    const e = named[i];
    if (!isUnnamedArea(e.name) || e.lat === undefined || e.lon === undefined) continue;
    const name = await geocode(e.lat, e.lon);
    // verified live 2026-10-20: OpenStreetMap often only knows the city district ("Indore City"). A generic or repeated
    // name says nothing, so such hotspots keep their placeholder and are described by direction from the city centre.
    if (name && isSpecificName(name, city, named)) {
      named[i] = { ...e, name };
      changed = true;
    }
  }
  if (!changed) return;
  replaceEvidence(ctx, withHeatmapEntities(heat, named));
}

/** Drops hotspots the user disliked (heatmap has no exclude parameter, so this is done after the call). */
function withoutCells(ctx: PipelineCtx, heat: Evidence, cellIds: readonly string[]): Evidence {
  if (cellIds.length === 0 || !heat.entities) return heat;
  const kept = withHeatmapEntities(heat, heat.entities.filter((e) => !cellIds.includes(e.id)));
  replaceEvidence(ctx, kept);
  return kept;
}

async function walkWhere(ctx: PipelineCtx, s: Signals, city: string, x: Exclusions): Promise<void> {
  const heat = await viaTool(ctx, "where", "qloo_heatmap", { location: city, ...signalArgsFor("heatmap", s) });
  if (heat) await nameHotspots(ctx, withoutCells(ctx, heat, x.cellIds), city);
}

/** Runs every section branch in parallel. Place-based sections only run when a city is known. */
export async function walkGraph(ctx: PipelineCtx, signals: Signals, city: string | undefined): Promise<void> {
  await walkSections(ctx, ["audience", "sound", "pairings", "aesthetic", "where"], signals, city, NO_EXCLUSIONS);
}

/**
 * Walks only the given sections in parallel (the full brief, or just the sections a refine run touches).
 * Pairings also need the places walk for cuisine tags, so it runs for either section.
 */
export async function walkSections(
  ctx: PipelineCtx,
  sections: readonly SectionKey[],
  signals: Signals,
  city: string | undefined,
  x: Exclusions,
): Promise<void> {
  setGuard(ctx, signals, city);
  const has = (k: SectionKey): boolean => sections.includes(k);
  const branches: Promise<void>[] = [];
  if (has("audience")) branches.push(walkAudience(ctx, signals, x));
  if (has("sound")) branches.push(walkSound(ctx, signals, x));
  if (has("pairings")) branches.push(walkPairings(ctx, signals, x));
  if (city && (has("aesthetic") || has("pairings"))) branches.push(walkPlaces(ctx, signals, city, x));
  if (city && has("where")) branches.push(walkWhere(ctx, signals, city, x));
  await Promise.all(branches);
}
