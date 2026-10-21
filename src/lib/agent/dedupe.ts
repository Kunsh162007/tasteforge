import type { Brief, Item } from "./brief";
import { nameTokens } from "./verify";

/**
 * One artist, place or brand appears once in a brief. Qloo sometimes lists the same act under two ids (a New York brief
 * showed Perfume Genius, Beach House and Sampha twice), and the writer sometimes repeats a name; items are compared by
 * Qloo id and by normalized name, within a list and across the lists that hold Qloo entities.
 */

const keysOf = (item: Pick<Item, "label" | "qlooId">): string[] => [
  ...(item.qlooId ? [`id:${item.qlooId}`] : []),
  `name:${nameTokens(item.label).join(" ")}`,
];

/** Items that were not seen before; `seen` collects the keys of the kept ones. */
function firstOccurrences<T extends Pick<Item, "label" | "qlooId">>(items: readonly T[], seen: Set<string>): T[] {
  const kept: T[] = [];
  for (const item of items) {
    const keys = keysOf(item);
    if (keys.some((k) => seen.has(k))) continue;
    for (const k of keys) seen.add(k);
    kept.push(item);
  }
  return kept;
}

/**
 * The brief without repeated entities. Artists, reference places, pairings and taste signals (affinities) share one
 * namespace, in that order; the other lists (palette, lighting, materials, hotspots, demographics) only lose their own repeats.
 */
export function dedupeBrief(brief: Brief): Brief {
  const shared = new Set<string>();
  // The specific lists win over the general one: an artist stays in "the sound", not in the audience's taste signals.
  const artists = firstOccurrences(brief.sound.artists, shared);
  const referencePlaces = firstOccurrences(brief.aesthetic.referencePlaces, shared);
  const pairings = firstOccurrences(brief.pairings, shared);
  const affinities = firstOccurrences(brief.audienceProfile.affinities, shared);
  const own = <T extends Pick<Item, "label" | "qlooId">>(items: readonly T[]): T[] => firstOccurrences(items, new Set<string>());
  return {
    ...brief,
    audienceProfile: {
      ...brief.audienceProfile,
      affinities,
      ...(brief.audienceProfile.demographics ? { demographics: own(brief.audienceProfile.demographics) } : {}),
    },
    aesthetic: {
      ...brief.aesthetic,
      palette: own(brief.aesthetic.palette),
      lighting: own(brief.aesthetic.lighting),
      materials: own(brief.aesthetic.materials),
      referencePlaces,
    },
    sound: { ...brief.sound, artists },
    pairings,
    ...(brief.whereTheyAre ? { whereTheyAre: { ...brief.whereTheyAre, hotspots: own(brief.whereTheyAre.hotspots) } } : {}),
  };
}
