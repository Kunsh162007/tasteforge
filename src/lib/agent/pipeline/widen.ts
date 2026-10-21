import type { SectionKey } from "../events";
import type { EvidenceDraft, EvidenceEntity } from "../ledger";
import { byAffinityThenId, compactEntities, EMPTY_LEDGER } from "../ledger";
import { executeTool, stringParams } from "../tools";
import { recordDraft, viaTool, type PipelineCtx } from "./context";
import { scrubEntities } from "./guard";
import { countContent, ledgerEntities, MINIMUMS, type ContentKind, type Shortfall } from "./minimum";
import type { Signals } from "./resolve";
import { signalArgsFor, venueTagIds } from "./routing";

/**
 * Targeted widening for thin sections: when the walk left a kind of content below its floor, a few broader queries run in
 * parallel (drop the most specific tag, the venue type alone, the seed entities alone, fewer tags, the city alone), and
 * what they add becomes one more evidence record. Nothing is invented: every result is a Qloo result with its own id.
 */

const WIDE_TAKE = 20;
/** Extra results one widening record may add. */
const MAX_ADDED = 6;
const TOP_PLACES_FOR_STYLE = 10;
export const DECOR_AMBIENCE_TYPES = ["urn:tag:decor:qloo", "urn:tag:ambience:qloo"];
const CUISINE_TYPES = ["urn:tag:cuisine:qloo", "urn:tag:specialty_dish:place", "urn:tag:genre:place:restaurant"];

type EntityKind = Exclude<ContentKind, "style">;
type Variant = { readonly label: string; readonly args: Readonly<Record<string, unknown>> };

const SECTION_OF: Readonly<Record<EntityKind, SectionKey>> = { place: "aesthetic", artist: "sound", brand: "pairings" };

const nonEmpty = (key: string, list: readonly string[] | undefined): Record<string, readonly string[]> => (list && list.length > 0 ? { [key]: list } : {});

function placeVariants(s: Signals, city: string): Variant[] {
  const venue = venueTagIds(s.tagIds);
  const sig = signalArgsFor("place", s);
  const tags = sig.tag_ids ?? [];
  const base = { type: "place", location: city, take: WIDE_TAKE };
  const filter = nonEmpty("filter_tag_ids", venue);
  return [
    { label: "without the most specific tag", args: { ...base, ...nonEmpty("entity_ids", sig.entity_ids), ...nonEmpty("tag_ids", tags.slice(0, -1)), ...filter } },
    ...(venue.length > 0 ? [{ label: "venue type alone", args: { ...base, ...filter } }] : []),
    ...(sig.entity_ids ? [{ label: "seed entities alone", args: { ...base, entity_ids: sig.entity_ids } }] : []),
    ...(tags.length > 0 ? [{ label: "first concept tags alone", args: { ...base, tag_ids: tags.slice(0, 2) } }] : []),
    { label: "the city alone", args: base },
  ];
}

function mediaVariants(kind: "artist" | "brand", s: Signals, city: string | undefined): Variant[] {
  const base = { type: kind, take: WIDE_TAKE, ...(city ? { signal_location: city } : {}) };
  const own = signalArgsFor(kind, s);
  const tagsOnly = signalArgsFor(kind, { entityIds: [], tagIds: s.tagIds });
  const taste = signalArgsFor("brand", { entityIds: [], tagIds: s.tagIds.filter((t) => !venueTagIds([t]).length) });
  return [
    { label: "more results", args: { ...base, ...own } },
    ...(s.entityIds.length > 0 ? [{ label: "seed entities alone", args: { ...base, entity_ids: s.entityIds } }] : []),
    ...(tagsOnly.tag_ids ? [{ label: "tags alone", args: { ...base, ...tagsOnly } }] : []),
    ...(taste.tag_ids ? [{ label: "all concept tags alone", args: { ...base, ...taste } }] : []),
  ];
}

const sameArgs = (a: Variant, b: Variant): boolean => JSON.stringify(a.args) === JSON.stringify(b.args);

async function runVariant(ctx: PipelineCtx, v: Variant): Promise<readonly EvidenceEntity[]> {
  const outcome = await executeTool({ name: "qloo_insights", args: { ...v.args } }, { qloo: ctx.qloo, ledger: EMPTY_LEDGER, now: ctx.now, brandScope: ctx.brandScope });
  return outcome.evidence?.entities ? [...outcome.evidence.entities].sort(byAffinityThenId) : [];
}

function widenedDraft(kind: EntityKind, city: string | undefined, labels: readonly string[], added: readonly EvidenceEntity[]): EvidenceDraft {
  const where = city ? (kind === "place" ? { location: city } : { signal_location: city }) : {};
  const params = stringParams({ type: kind, ...where, widened: labels.join("; ") });
  if (added.length === 0) return { endpoint: "/v2/insights", params, summary: "No results. The broader queries found nothing new." };
  const top = added.slice(0, 5).map((e) => e.name).join(", ");
  return { endpoint: "/v2/insights", params, summary: `${added.length} results; top: ${top}`, entities: compactEntities(added) };
}

/** Runs the broader queries for one kind in parallel and records what they add as a single evidence record. */
async function widenEntities(ctx: PipelineCtx, kind: EntityKind, s: Signals, city: string | undefined): Promise<void> {
  if (kind === "place" && !city) return;
  const all = kind === "place" ? placeVariants(s, city as string) : mediaVariants(kind, s, city);
  const variants = all.filter((v, i) => all.findIndex((o) => sameArgs(o, v)) === i);
  const call = { name: "qloo_insights", args: { type: kind, ...(city ? (kind === "place" ? { location: city } : { signal_location: city }) : {}), widened: variants.map((v) => v.label).join("; ") } };
  await recordDraft(ctx, SECTION_OF[kind], call, async () => {
    const answers = await Promise.allSettled(variants.map((v) => runVariant(ctx, v)));
    const have = new Set(ledgerEntities(ctx.box.ledger, kind).map((x) => x.entity.id));
    const added: EvidenceEntity[] = [];
    const used: string[] = [];
    answers.forEach((a, i) => {
      if (a.status !== "fulfilled") return;
      const scrubbed = scrubEntities(a.value, ctx.guard.current, kind === "place").kept;
      const fresh = scrubbed.filter((e) => !have.has(e.id) && !added.some((x) => x.id === e.id));
      if (fresh.length > 0) used.push(variants[i].label);
      added.push(...fresh);
    });
    const failed = answers.length > 0 && answers.every((a) => a.status === "rejected");
    if (failed) throw new Error("Every broader query failed.");
    return widenedDraft(kind, city, used.length > 0 ? used : variants.map((v) => v.label), added.slice(0, MAX_ADDED));
  });
}

/** Decor, ambience and cuisine tags of the best places seen so far, when the first places query was too thin to supply them. */
async function fillPlaceTags(ctx: PipelineCtx): Promise<void> {
  const ids = ledgerEntities(ctx.box.ledger, "place")
    .map((x) => x.entity)
    .slice(0, TOP_PLACES_FOR_STYLE)
    .map((e) => e.id);
  if (ids.length === 0) return;
  const needStyle = countContent(ctx.box.ledger, "style") < MINIMUMS.style;
  const hasMenu = ctx.box.ledger.records.some((r) => r.endpoint.includes("urn:tag") && (r.params.tag_types ?? "").includes("cuisine") && (r.tags?.length ?? 0) > 0);
  await Promise.all([
    needStyle ? viaTool(ctx, "aesthetic", "qloo_entity_tags", { entity_ids: ids, tag_types: DECOR_AMBIENCE_TYPES, take: 20 }) : undefined,
    hasMenu ? undefined : viaTool(ctx, "pairings", "qloo_entity_tags", { entity_ids: ids, tag_types: CUISINE_TYPES, take: 10 }),
  ]);
}

const LABELS: Readonly<Record<ContentKind, string>> = { place: "places", artist: "artists", brand: "brands", style: "palette tags" };

/**
 * Widens every kind of content below its floor, in parallel. Style tags need places, so they follow the places widening.
 * Returns a short note for the stage event ("widened places and artists"), or undefined when nothing was short.
 */
export async function widenThinSections(ctx: PipelineCtx, signals: Signals, city: string | undefined, short: readonly Shortfall[]): Promise<string | undefined> {
  if (short.length === 0) return undefined;
  const kinds = short.map((x) => x.kind);
  const entityKinds = kinds.filter((k): k is EntityKind => k !== "style");
  await Promise.all(entityKinds.map((k) => widenEntities(ctx, k, signals, city)));
  if (city && (kinds.includes("style") || kinds.includes("place"))) await fillPlaceTags(ctx);
  const names = kinds.map((k) => LABELS[k]);
  return `widened ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]}`;
}
