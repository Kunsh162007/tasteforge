import { itemKey, itemsAt, SLOTS, type SlotPath } from "@/lib/agent/briefItems";
import type { Brief, SectionKey } from "./contract";

/** What a refine run changed, computed in the browser from the old and new brief. */

export const SECTION_TITLES: Record<SectionKey, string> = {
  audience: "The audience",
  aesthetic: "The look",
  sound: "The sound",
  pairings: "Pairings",
  where: "Where they are",
};

export type ChangedItem = { key: string; label: string; section: SectionKey };

export type BriefChanges = {
  /** Keys (see itemKey) of items that are new in the refined brief; they get the entrance animation. */
  addedKeys: readonly string[];
  added: readonly ChangedItem[];
  removed: readonly ChangedItem[];
  sections: readonly SectionKey[];
  summary: string;
};

const MAX_NAMES = 3;

function listNames(items: readonly ChangedItem[]): string {
  const shown = items.slice(0, MAX_NAMES).map((i) => i.label);
  const more = items.length - shown.length;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(", ");
}

function summarize(added: readonly ChangedItem[], removed: readonly ChangedItem[], sections: readonly SectionKey[]): string {
  if (added.length === 0 && removed.length === 0) {
    return "Nothing changed: Qloo had no stronger alternatives for the items you marked.";
  }
  const where = sections.map((s) => SECTION_TITLES[s].toLowerCase()).join(", ");
  const parts = [`Refreshed ${where}.`];
  if (removed.length > 0) parts.push(`Out: ${listNames(removed)}.`);
  if (added.length > 0) parts.push(`In: ${listNames(added)}.`);
  return parts.join(" ");
}

const keysOf = (brief: Brief, path: SlotPath): Map<string, string> =>
  new Map(itemsAt(brief, path).map((item) => [itemKey(path, item), item.label]));

/** Pure: compares every reviewable list of two briefs. */
export function diffBriefs(previous: Brief, next: Brief): BriefChanges {
  const added: ChangedItem[] = [];
  const removed: ChangedItem[] = [];
  for (const { path, section } of SLOTS) {
    const before = keysOf(previous, path);
    const after = keysOf(next, path);
    for (const [key, label] of after) if (!before.has(key)) added.push({ key, label, section });
    for (const [key, label] of before) if (!after.has(key)) removed.push({ key, label, section });
  }
  const sections = [...new Set([...added, ...removed].map((c) => c.section))];
  return { addedKeys: added.map((a) => a.key), added, removed, sections, summary: summarize(added, removed, sections) };
}
