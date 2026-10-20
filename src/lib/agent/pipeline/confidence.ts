import type { Brief } from "../brief";
import type { Confidence, SectionConfidence, SectionKey } from "../events";
import type { SectionStat } from "./context";

/** How many grounded items make a section well supported. */
export const HIGH_ITEMS = 3;

function countItems(brief: Brief): Record<SectionKey, number> {
  const a = brief.audienceProfile;
  const s = brief.aesthetic;
  return {
    audience: a.affinities.length + (a.demographics?.length ?? 0),
    aesthetic: s.palette.length + s.lighting.length + s.materials.length + s.referencePlaces.length,
    sound: brief.sound.artists.length,
    pairings: brief.pairings.length,
    where: brief.whereTheyAre?.hotspots.length ?? 0,
  };
}

function levelFor(items: number, stat: SectionStat | undefined): Confidence {
  if (items === 0 || !stat || stat.usable === 0) return "low";
  const degraded = stat.fallbacks.length > 0 || (stat.skipped ?? 0) > 0;
  return items >= HIGH_ITEMS && !degraded ? "high" : "medium";
}

/**
 * Pure: confidence per section from how many grounded items survived validation and whether the
 * critic had to fall back (dropped the city, switched signal type) to get data.
 */
export function sectionConfidence(brief: Brief, stats: ReadonlyMap<SectionKey, SectionStat>): SectionConfidence {
  const items = countItems(brief);
  const keys = Object.keys(items) as SectionKey[];
  return Object.fromEntries(keys.map((k) => [k, levelFor(items[k], stats.get(k))])) as SectionConfidence;
}
