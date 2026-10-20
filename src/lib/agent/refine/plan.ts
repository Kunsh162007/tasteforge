import type { BriefDraft, Item } from "../brief";
import { itemRef, itemsAt, parseItemKey, SLOTS, sectionOf, type SlotPath } from "../briefItems";
import type { SectionKey } from "../events";
import type { Evidence } from "../ledger";
import type { Feedback } from "./request";

/** Turns raw UI feedback into what the refine run needs: sections to re-walk, exclusions, extra signals, items to keep. */

const TAG_PREFIX = "urn:tag:";
const HOTSPOTS: SlotPath = "whereTheyAre.hotspots";

export type Exclusions = {
  readonly entityIds: readonly string[];
  readonly tagIds: readonly string[];
  /** Heatmap cell ids (geohash) to drop from the re-walked hotspots. */
  readonly cellIds: readonly string[];
};

export const NO_EXCLUSIONS: Exclusions = { entityIds: [], tagIds: [], cellIds: [] };

export type RefinePlan = {
  /** Sections that get a new graph walk and a regenerated item list. */
  readonly sections: readonly SectionKey[];
  readonly exclusions: Exclusions;
  readonly likedEntityIds: readonly string[];
  readonly likedTagIds: readonly string[];
  /** Per list: the items that must stay verbatim (liked or locked), in their original order. */
  readonly keep: ReadonlyMap<SlotPath, readonly Item[]>;
  /** Normalised refs and labels of disliked items, used to keep them out of the new brief. */
  readonly dislikedRefs: ReadonlySet<string>;
  readonly dislikedLabels: ReadonlySet<string>;
};

export const normLabel = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const unique = <T>(list: readonly T[]): T[] => [...new Set(list)];

type Ids = { entityIds: string[]; tagIds: string[]; cellIds: string[] };
const emptyIds = (): Ids => ({ entityIds: [], tagIds: [], cellIds: [] });

/** Qloo ids behind an item: its own qlooId, or entities/tags with the same name in the evidence it cites. */
function idsOf(path: SlotPath, item: Item, byId: ReadonlyMap<string, Evidence>): Ids {
  const out = emptyIds();
  if (item.qlooId) {
    if (path === HOTSPOTS) out.cellIds.push(item.qlooId);
    else if (item.qlooId.startsWith(TAG_PREFIX)) out.tagIds.push(item.qlooId);
    else out.entityIds.push(item.qlooId);
    return out;
  }
  // A palette swatch is named like a colour; the Qloo tags it came from are in `tags`.
  const sourceTags = (item as { tags?: readonly string[] }).tags ?? [];
  const wanted = new Set([normLabel(item.label), ...sourceTags.map(normLabel)]);
  for (const evId of item.evidence) {
    const record = byId.get(evId);
    if (!record) continue;
    for (const t of record.tags ?? []) if (wanted.has(normLabel(t.name))) out.tagIds.push(t.id);
    for (const e of record.entities ?? []) if (wanted.has(normLabel(e.name))) (path === HOTSPOTS ? out.cellIds : out.entityIds).push(e.id);
  }
  return out;
}

type Hit = { readonly path: SlotPath; readonly item: Item };

function mergeIds(hits: readonly Hit[], byId: ReadonlyMap<string, Evidence>): Ids {
  const all = emptyIds();
  for (const { path, item } of hits) {
    const ids = idsOf(path, item, byId);
    all.entityIds.push(...ids.entityIds);
    all.tagIds.push(...ids.tagIds);
    all.cellIds.push(...ids.cellIds);
  }
  return { entityIds: unique(all.entityIds), tagIds: unique(all.tagIds), cellIds: unique(all.cellIds) };
}

export function buildPlan(brief: BriefDraft, evidence: readonly Evidence[], feedback: Feedback): RefinePlan {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const liked = new Set(feedback.liked);
  const disliked = new Set(feedback.disliked);
  const locked = new Set(feedback.locked.filter((k) => parseItemKey(k) !== undefined));
  const isLocked = (path: SlotPath, item: Item): boolean => locked.has(`${path}|${itemRef(item)}`);
  const isLiked = (item: Item): boolean => liked.has(itemRef(item)) || liked.has(item.label);
  const isDisliked = (item: Item): boolean => disliked.has(itemRef(item)) || disliked.has(item.label);

  const hits = (test: (path: SlotPath, item: Item) => boolean): Hit[] =>
    SLOTS.flatMap(({ path }) => itemsAt(brief, path).filter((item) => test(path, item)).map((item) => ({ path, item })));
  const dislikedHits = hits((path, item) => isDisliked(item) && !isLocked(path, item));
  const likedHits = hits((_path, item) => isLiked(item) && !isDisliked(item));
  // "More like these": with nothing disliked, the sections of liked items are refreshed around them.
  const triggers = dislikedHits.length > 0 ? dislikedHits : likedHits;
  const sections = unique(triggers.map((t) => sectionOf(t.path)));

  const excluded = mergeIds(dislikedHits, byId);
  const lifted = mergeIds(likedHits, byId);

  const keep = new Map<SlotPath, readonly Item[]>();
  for (const { path, section } of SLOTS) {
    if (!sections.includes(section)) continue;
    keep.set(path, itemsAt(brief, path).filter((i) => !(isDisliked(i) && !isLocked(path, i)) && (isLiked(i) || isLocked(path, i))));
  }

  return {
    sections,
    exclusions: excluded,
    likedEntityIds: lifted.entityIds,
    likedTagIds: lifted.tagIds,
    keep,
    dislikedRefs: new Set(dislikedHits.map((h) => itemRef(h.item))),
    dislikedLabels: new Set(dislikedHits.map((h) => normLabel(h.item.label))),
  };
}
