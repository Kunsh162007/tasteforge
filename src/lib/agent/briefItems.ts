import type { BriefDraft, Item } from "./brief";
import type { SectionKey } from "./events";

/**
 * Where the reviewable items of a brief live. Pure helpers shared by the refine backend and the UI (type-only
 * imports, so it is safe in the browser bundle).
 */

export type SlotPath =
  | "audienceProfile.affinities"
  | "aesthetic.palette"
  | "aesthetic.lighting"
  | "aesthetic.materials"
  | "aesthetic.referencePlaces"
  | "sound.artists"
  | "pairings"
  | "whereTheyAre.hotspots";

export const SLOTS: readonly { readonly path: SlotPath; readonly section: SectionKey }[] = [
  { path: "audienceProfile.affinities", section: "audience" },
  { path: "aesthetic.palette", section: "aesthetic" },
  { path: "aesthetic.lighting", section: "aesthetic" },
  { path: "aesthetic.materials", section: "aesthetic" },
  { path: "aesthetic.referencePlaces", section: "aesthetic" },
  { path: "sound.artists", section: "sound" },
  { path: "pairings", section: "pairings" },
  { path: "whereTheyAre.hotspots", section: "where" },
];

export const sectionOf = (path: SlotPath): SectionKey => SLOTS.find((s) => s.path === path)?.section ?? "audience";

export const isSlotPath = (value: string): value is SlotPath => SLOTS.some((s) => s.path === value);

/** Stable reference to an item: its Qloo id when it has one, else its label. */
export const itemRef = (item: Pick<Item, "label" | "qlooId">): string => item.qlooId ?? item.label;

/** Key identifying one item in one list, e.g. "sound.artists|MOCK-ARTIST-1". */
export const itemKey = (path: SlotPath, item: Pick<Item, "label" | "qlooId">): string => `${path}|${itemRef(item)}`;

export function parseItemKey(key: string): { path: SlotPath; ref: string } | undefined {
  const at = key.indexOf("|");
  const path = key.slice(0, at);
  return at > 0 && isSlotPath(path) ? { path, ref: key.slice(at + 1) } : undefined;
}

export function itemsAt(brief: BriefDraft, path: SlotPath): readonly Item[] {
  switch (path) {
    case "audienceProfile.affinities":
      return brief.audienceProfile.affinities;
    case "aesthetic.palette":
      return brief.aesthetic.palette;
    case "aesthetic.lighting":
      return brief.aesthetic.lighting;
    case "aesthetic.materials":
      return brief.aesthetic.materials;
    case "aesthetic.referencePlaces":
      return brief.aesthetic.referencePlaces;
    case "sound.artists":
      return brief.sound.artists;
    case "pairings":
      return brief.pairings;
    case "whereTheyAre.hotspots":
      return brief.whereTheyAre?.hotspots ?? [];
  }
}

/** Returns a copy of the brief with one list replaced (palette items must keep their hex). */
export function withItemsAt<T extends BriefDraft>(brief: T, path: SlotPath, items: readonly Item[]): T {
  const list = items as Item[];
  switch (path) {
    case "audienceProfile.affinities":
      return { ...brief, audienceProfile: { ...brief.audienceProfile, affinities: list } };
    case "aesthetic.palette":
      return { ...brief, aesthetic: { ...brief.aesthetic, palette: list.filter((i): i is BriefDraft["aesthetic"]["palette"][number] => "hex" in i) } };
    case "aesthetic.lighting":
      return { ...brief, aesthetic: { ...brief.aesthetic, lighting: list } };
    case "aesthetic.materials":
      return { ...brief, aesthetic: { ...brief.aesthetic, materials: list } };
    case "aesthetic.referencePlaces":
      return { ...brief, aesthetic: { ...brief.aesthetic, referencePlaces: list } };
    case "sound.artists":
      return { ...brief, sound: { ...brief.sound, artists: list } };
    case "pairings":
      return { ...brief, pairings: list };
    case "whereTheyAre.hotspots":
      return brief.whereTheyAre ? { ...brief, whereTheyAre: { ...brief.whereTheyAre, hotspots: list } } : brief;
  }
}
