import type { BriefDraft, Item } from "../brief";
import { itemRef, itemsAt, SLOTS, withItemsAt, type SlotPath } from "../briefItems";
import { normLabel, type RefinePlan } from "./plan";

/**
 * Combines the previous brief with the regenerated draft. Code, not the model, guarantees the contract:
 * - sections without feedback are carried over untouched;
 * - in refreshed lists, liked and locked items stay verbatim, disliked items never return;
 * - the model's new items fill the remaining slots (up to the previous list length).
 */

function isBlocked(item: Item, plan: RefinePlan): boolean {
  return plan.dislikedRefs.has(itemRef(item)) || plan.dislikedRefs.has(item.label) || plan.dislikedLabels.has(normLabel(item.label));
}

function mergeList(path: SlotPath, previous: BriefDraft, draft: BriefDraft, plan: RefinePlan): readonly Item[] {
  const old = itemsAt(previous, path);
  const kept = plan.keep.get(path) ?? [];
  const keptRefs = new Set(kept.map(itemRef));
  const taken = new Set(kept.map((i) => normLabel(i.label)));
  const fresh: Item[] = [];
  for (const item of itemsAt(draft, path)) {
    const label = normLabel(item.label);
    if (isBlocked(item, plan) || taken.has(label)) continue;
    taken.add(label);
    fresh.push(item);
  }
  // The model gave nothing usable for this list: keep the neutral old items rather than emptying it.
  const neutral = old.filter((i) => !isBlocked(i, plan) && !keptRefs.has(itemRef(i)));
  const fill = (fresh.length > 0 ? fresh : neutral).slice(0, Math.max(old.length - kept.length, 0));
  return [...kept, ...fill];
}

export function mergeRefinement(previous: BriefDraft, draft: BriefDraft, plan: RefinePlan): BriefDraft {
  let merged: BriefDraft = previous;
  for (const { path } of SLOTS) {
    if (plan.keep.has(path)) merged = withItemsAt(merged, path, mergeList(path, previous, draft, plan));
  }
  if (plan.sections.includes("audience") && draft.audienceProfile.summary) {
    merged = { ...merged, audienceProfile: { ...merged.audienceProfile, summary: draft.audienceProfile.summary } };
  }
  if (plan.sections.includes("sound") && draft.sound.direction) {
    merged = { ...merged, sound: { ...merged.sound, direction: draft.sound.direction } };
  }
  return merged;
}
