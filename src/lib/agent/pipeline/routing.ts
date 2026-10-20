import type { Signals } from "./resolve";

/**
 * Which taste signals suit which kind of query. verified live 2026-10-20: tags only mean something for the
 * entity kinds they belong to. Place tags (ambience, decor, customer identity) fed to an artist query returned
 * K-pop for an Indore cafe, while music-genre tags returned the indie bands the brief asked for.
 */

export type SignalKind = "artist" | "place" | "brand" | "movie" | "tv_show" | "demographics" | "heatmap";

const MUSIC_PREFIX = "urn:tag:genre:music:";
const MEDIA_PREFIX = "urn:tag:genre:media:";
/** Tags that name the kind of venue (cafe, record shop): a hard filter for place queries, never a taste signal. */
const VENUE_PREFIXES = ["urn:tag:category:place:", "urn:tag:genre:place:"];

export const isMusicTag = (id: string): boolean => id.startsWith(MUSIC_PREFIX);
export const isVenueTag = (id: string): boolean => VENUE_PREFIXES.some((p) => id.startsWith(p));
/** Who a venue is for: it describes customers of places and brands, and only drags film and TV picks off course. */
const CUSTOMER_PREFIXES = ["urn:tag:customer_identity:", "urn:tag:good_for:"];
const isCustomerTag = (id: string): boolean => CUSTOMER_PREFIXES.some((p) => id.startsWith(p));
const isMediaTag = (id: string): boolean => id.startsWith(MEDIA_PREFIX);

/** The one venue tag used to narrow place results (first resolved wins). */
export const venueTagIds = (tagIds: readonly string[]): string[] => tagIds.filter(isVenueTag).slice(0, 1);

function ownTags(kind: SignalKind, taste: readonly string[]): string[] {
  if (kind === "artist") return taste.filter(isMusicTag);
  if (kind === "place") return taste.filter((t) => !isMusicTag(t) && !isMediaTag(t));
  // verified live 2026-10-20: music-genre tags fed to a film query returned blockbusters unrelated to the audience
  // (Star Trek for ambient / lo-fi fans) and made it the slowest call of the walk; the seeds alone found Shoplifters.
  if (kind === "movie" || kind === "tv_show") return taste.filter((t) => !isCustomerTag(t) && !isMusicTag(t));
  return [...taste];
}

/**
 * verified live 2026-10-20: an insights call with seed entities and five or more tags can take 35 s on Qloo's side
 * (three or four tags answer in under 2 s), so entity-anchored calls carry at most this many tags.
 */
const MAX_TAGS_WITH_ENTITIES = 3;
const MAX_TAGS_ALONE = 6;

/** Tag ids that suit `kind`, falling back to every taste tag when the kind would otherwise get no signal at all. */
export function tagsFor(kind: SignalKind, s: Pick<Signals, "tagIds" | "entityIds">): string[] {
  const taste = s.tagIds.filter((t) => !isVenueTag(t));
  const own = ownTags(kind, taste);
  // An artist or film query with seed entities stays on the entities; otherwise any taste tag beats an empty query.
  const entityOnly = (kind === "artist" || kind === "movie" || kind === "tv_show") && s.entityIds.length > 0;
  const chosen = own.length > 0 ? own : entityOnly ? [] : taste;
  return chosen.slice(0, s.entityIds.length > 0 ? MAX_TAGS_WITH_ENTITIES : MAX_TAGS_ALONE);
}

/** Tool-argument form of the signals for one kind of query (empty lists are omitted). */
export function signalArgsFor(kind: SignalKind, s: Pick<Signals, "tagIds" | "entityIds">): Record<string, readonly string[]> {
  const tags = tagsFor(kind, s);
  return {
    ...(s.entityIds.length > 0 ? { entity_ids: s.entityIds } : {}),
    ...(tags.length > 0 ? { tag_ids: tags } : {}),
  };
}
