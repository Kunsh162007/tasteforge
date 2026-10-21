import type { QlooEntity } from "@/lib/qloo";
import type { NeedsInputOption } from "../events";
import { entityDraft, tagDraft } from "../summaries";
import { stringParams } from "../tools";
import { TYPE_URNS, type TypeName } from "../toolSchemas";
import { recordDraft, type PipelineCtx } from "./context";
import { isMusicTag, isVenueTag } from "./routing";
import type { SeedPlan } from "./seeds";
import type { QlooTag } from "@/lib/qloo";

const SEARCH_TAKE = 5;
const TAG_TAKE = 8;
/** Tag-search records only back the chosen concepts; the model needs the top few, not all 8. */
const CONCEPT_EVIDENCE_TAGS = 4;
const MUSIC_TAG_TYPE = "urn:tag:genre:music";
const MUSIC_TAGS_PER_CONCEPT = 1;
/** A tag that applies to this many entity kinds or more is too generic to say anything ("Music"). */
const GENERIC_TAG_KINDS = 6;
/** Tag families that proved to be noise for taste matching (verified live 2026-10-20: "A24 Motorway"). */
const NOISY_TAG_FAMILIES = ["urn:tag:nearby_attraction:", "urn:tag:view:", "urn:tag:neighborhood_characteristics:"];
const TAGS_PER_CONCEPT = 2;
const MAX_OPTIONS_PER_SEED = 3;
const MAX_ENTITY_SIGNALS = 5;
const MAX_TAG_SIGNALS = 8;
/** Name for a user-chosen entity this round did not search for again; only the id is needed downstream. */
const CHOSEN_NAME = "your pick";

export type Signals = {
  readonly entityIds: readonly string[];
  readonly tagIds: readonly string[];
  readonly entityNames: readonly string[];
  readonly tagNames: readonly string[];
};

export type Ambiguity = { readonly seed: string; readonly options: readonly NeedsInputOption[] };

export type Resolution = {
  readonly signals: Signals;
  /** Seeds whose match is unclear and that the user has not chosen yet. */
  readonly ambiguities: readonly Ambiguity[];
  readonly unresolvedSeeds: readonly string[];
};

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const squash = (s: string): string => normalize(s).replace(/ /g, "");
const MIN_CONTAINED = 4;
const MIN_DICE = 0.7;

function bigrams(s: string): string[] {
  return Array.from({ length: Math.max(s.length - 1, 0) }, (_, i) => s.slice(i, i + 2));
}

/** Dice coefficient of two strings' letter pairs: 1 = same, 0 = nothing shared (tolerates typos and spacing). */
function similarity(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (x.length === 0 || y.length === 0) return a === b ? 1 : 0;
  const left = new Map<string, number>();
  for (const g of x) left.set(g, (left.get(g) ?? 0) + 1);
  let shared = 0;
  for (const g of y) {
    const n = left.get(g) ?? 0;
    if (n > 0) {
      shared += 1;
      left.set(g, n - 1);
    }
  }
  return (2 * shared) / (x.length + y.length);
}

/**
 * Whether a search hit is plausibly the thing that was asked for. verified live 2026-10-21: a movie search for "Studio
 * Ghibli" returned only "Taylor Swift: Folklore: The Long Pond Studio Sessions", and that became a taste signal for a ceramics
 * studio. A hit counts when one name contains the other or they are nearly the same letters; anything else is no match.
 */
export function isPlausibleMatch(seed: string, name: string): boolean {
  const a = squash(seed);
  const b = squash(name);
  if (a === "" || b === "") return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= MIN_CONTAINED && long.includes(short)) return true;
  return similarity(a, b) >= MIN_DICE;
}

export const kindOf = (type: string): string => type.split(":").pop() || "entity";

const toOption = (e: QlooEntity): NeedsInputOption => ({ label: `${e.name} (${kindOf(e.type)})`, qlooId: e.id, kind: kindOf(e.type) });

type Outcome =
  | { readonly kind: "picked"; readonly entity: QlooEntity }
  | { readonly kind: "ambiguous"; readonly options: readonly NeedsInputOption[] }
  | { readonly kind: "none" };

/**
 * Exact name matches win. Several exact matches of different types, or no exact match with
 * differently-typed top results (when the type was not known), are ambiguous. Otherwise the top hit wins.
 */
export function judgeMatches(
  seed: string,
  typeKnown: boolean,
  results: readonly QlooEntity[],
  chosen: readonly string[],
  autoPick = false,
): Outcome {
  if (results.length === 0) return { kind: "none" };
  const picked = results.find((r) => chosen.includes(r.id));
  if (picked) return { kind: "picked", entity: picked };
  const wanted = normalize(seed);
  const exact = results.filter((r) => normalize(r.name) === wanted);
  const plausible = results.filter((r) => isPlausibleMatch(seed, r.name));
  if (exact.length === 0 && plausible.length === 0) return { kind: "none" };
  const pool = exact.length > 0 ? exact : plausible.slice(0, 2);
  const distinctTypes = new Set(pool.map((r) => r.type));
  const mixed = distinctTypes.size > 1 && (exact.length > 0 || !typeKnown);
  if (!mixed || autoPick) return { kind: "picked", entity: pool[0] };
  return { kind: "ambiguous", options: (exact.length > 0 ? exact.concat(plausible.filter((r) => !exact.includes(r))) : plausible).slice(0, MAX_OPTIONS_PER_SEED).map(toOption) };
}

async function searchOnce(ctx: PipelineCtx, query: string, kind: TypeName | undefined): Promise<readonly QlooEntity[]> {
  const args = { query, ...(kind ? { types: [kind] } : {}), take: SEARCH_TAKE };
  let found: readonly QlooEntity[] = [];
  await recordDraft(ctx, undefined, { name: "qloo_search", args }, async () => {
    const r = await ctx.qloo.search({ query, types: kind ? [TYPE_URNS[kind]] : undefined, take: SEARCH_TAKE });
    found = r.data;
    return entityDraft({ endpoint: "/search", params: stringParams(args) }, r);
  });
  return found;
}

async function resolveSeed(
  ctx: PipelineCtx,
  seed: SeedPlan["seeds"][number],
  chosen: readonly string[],
  autoPick: boolean,
): Promise<Outcome> {
  const kind = seed.kind === "other" ? undefined : (seed.kind as TypeName);
  let results = await searchOnce(ctx, seed.name, kind);
  const hasMatch = (list: readonly QlooEntity[]): boolean => list.some((r) => isPlausibleMatch(seed.name, r.name));
  // A typed search that found nothing like the name is tried again without the type.
  if (!hasMatch(results) && kind) results = [...results, ...(await searchOnce(ctx, seed.name, undefined))];
  return judgeMatches(seed.name, kind !== undefined, results, chosen, autoPick);
}

type ConceptKind = "concept" | "music" | "venue";

const wordsOf = (s: string): string => ` ${normalize(s)} `;

/** A venue tag counts only when its name and the requested venue contain one another ("bar" for "ramen bar"). */
function matchesVenue(tag: QlooTag, venue: string): boolean {
  const t = wordsOf(tag.name);
  const v = wordsOf(venue);
  return t.includes(v) || v.includes(t);
}

const isGeneric = (t: QlooTag): boolean => (t.entityTypes?.length ?? 0) >= GENERIC_TAG_KINDS;
const isNoisy = (t: QlooTag): boolean => NOISY_TAG_FAMILIES.some((f) => t.id.startsWith(f));
const appliesToPlaces = (t: QlooTag): boolean => (t.entityTypes ?? []).some((k) => k === "place" || k === "brand");

/** Chooses the tags worth using as signals from a tag search; the pick depends on what the phrase stands for. */
export function pickTags(kind: ConceptKind, tags: readonly QlooTag[], phrase: string): QlooTag[] {
  if (kind === "music") return tags.filter((t) => isMusicTag(t.id)).slice(0, MUSIC_TAGS_PER_CONCEPT);
  if (kind === "venue") {
    const venues = tags.filter((t) => isVenueTag(t.id) && matchesVenue(t, phrase));
    const preferred = venues.find((t) => t.id.startsWith("urn:tag:category:place:")) ?? venues[0];
    return preferred ? [preferred] : [];
  }
  const usable = tags.filter((t) => !isGeneric(t) && !isNoisy(t) && !isVenueTag(t.id) && !isMusicTag(t.id));
  const placeTags = usable.filter(appliesToPlaces);
  const picked = placeTags.length > 0 ? placeTags : usable;
  const seen = new Set<string>();
  return picked
    .filter((t) => (seen.has(normalize(t.name)) ? false : (seen.add(normalize(t.name)), true)))
    .slice(0, placeTags.length > 0 ? TAGS_PER_CONCEPT : 1);
}

async function resolveConcept(ctx: PipelineCtx, concept: string, kind: ConceptKind = "concept"): Promise<readonly { id: string; name: string }[]> {
  const tagTypes = kind === "music" ? [MUSIC_TAG_TYPE] : undefined;
  const args = { query: concept, ...(tagTypes ? { tag_types: tagTypes } : {}), take: TAG_TAKE };
  let tags: readonly { id: string; name: string }[] = [];
  await recordDraft(ctx, undefined, { name: "qloo_find_tags", args }, async () => {
    const r = await ctx.qloo.findTags({ query: concept, tagTypes, take: TAG_TAKE });
    const picked = pickTags(kind, r.data, concept);
    tags = picked;
    // The chosen tags lead the evidence record, so the short list the model sees always contains them.
    const rest = r.data.filter((t) => !picked.some((p) => p.id === t.id));
    return tagDraft({ endpoint: "/v2/tags", params: stringParams(args) }, { ...r, data: [...picked, ...rest] }, CONCEPT_EVIDENCE_TAGS);
  });
  return tags;
}

/** First tag of each name (the same word in two tag families, such as "Luxurious", would double its weight). */
const uniqueByName = <T extends { readonly name: string }>(items: readonly T[]): T[] => {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(normalize(i.name)) ? false : (seen.add(normalize(i.name)), true)));
};

/** First occurrence of each id, in order. */
const uniqueById = <T extends { readonly id: string }>(items: readonly T[]): T[] => {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
};

/** The ids the user chose, as entities: taken as they are, named from this round's matches when it has them. */
function chosenEntities(chosen: readonly string[], found: readonly { id: string; name: string }[]): { id: string; name: string }[] {
  const names = new Map(found.map((e) => [e.id, e.name]));
  return chosen.map((id) => ({ id, name: names.get(id) ?? CHOSEN_NAME }));
}

/**
 * Stage 2: resolve seeds to entity ids and concepts to tag ids, all in parallel.
 * `chosen` holds Qloo ids the user picked after a needs_input round; `autoPick` takes the top match
 * instead of reporting ambiguity (showcases and smoke runs).
 */
export async function resolveSeeds(
  ctx: PipelineCtx,
  plan: SeedPlan,
  chosen: readonly string[],
  autoPick = false,
): Promise<Resolution> {
  // Someone who already answered a question is not asked again, whatever the seeds look like this round.
  const picking = autoPick || chosen.length > 0;
  const conceptCalls: [string, ConceptKind][] = [
    ...(plan.venue ? [[plan.venue, "venue"] as [string, ConceptKind]] : []),
    ...(plan.musicTags ?? []).map((t): [string, ConceptKind] => [t, "music"]),
    ...plan.tags.map((t): [string, ConceptKind] => [t, "concept"]),
  ];
  const [outcomes, tagLists] = await Promise.all([
    Promise.all(plan.seeds.map((s) => resolveSeed(ctx, s, chosen, picking))),
    Promise.all(conceptCalls.map(([phrase, kind]) => resolveConcept(ctx, phrase, kind))),
  ]);
  const entities: QlooEntity[] = [];
  const ambiguities: Ambiguity[] = [];
  const unresolvedSeeds: string[] = [];
  outcomes.forEach((o, i) => {
    const seed = plan.seeds[i].name;
    if (o.kind === "picked") entities.push(o.entity);
    else if (o.kind === "ambiguous") ambiguities.push({ seed, options: o.options });
    else unresolvedSeeds.push(seed);
  });
  const tags = uniqueByName(uniqueById(tagLists.flat())).slice(0, MAX_TAG_SIGNALS);
  const kept = uniqueById([...chosenEntities(chosen, entities), ...entities]).slice(0, MAX_ENTITY_SIGNALS);
  return {
    signals: {
      entityIds: kept.map((e) => e.id),
      tagIds: tags.map((t) => t.id),
      entityNames: kept.map((e) => e.name),
      tagNames: tags.map((t) => t.name),
    },
    ambiguities,
    unresolvedSeeds,
  };
}

/** Last resort when nothing resolved: look the request text itself up as a tag concept. */
export async function resolveFromPrompt(ctx: PipelineCtx, prompt: string): Promise<Signals | undefined> {
  const tags = await resolveConcept(ctx, prompt.trim().slice(0, 80));
  if (tags.length === 0) return undefined;
  return { entityIds: [], tagIds: tags.map((t) => t.id), entityNames: [], tagNames: tags.map((t) => t.name) };
}
