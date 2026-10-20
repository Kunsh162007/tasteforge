import type { Brief, BriefDraft, BriefMode, DroppedItem, Item } from "./brief";
import { hasEvidence, type Ledger } from "./ledger";

export type ValidationResult = {
  readonly brief: Brief;
  readonly dropped: readonly DroppedItem[];
};

type Tally = { total: number; grounded: number; dropped: DroppedItem[] };

function checkEvidence(ids: readonly string[], ledger: Ledger): { valid: string[]; reason?: DroppedItem["reason"] } {
  const valid = ids.filter((id) => hasEvidence(ledger, id));
  if (valid.length > 0) return { valid };
  return { valid, reason: ids.length === 0 ? "no_evidence" : "unknown_evidence" };
}

/** Keeps items with at least one real citation (trimmed to valid ids); records the rest. */
function filterItems<T extends Item>(items: readonly T[], section: string, ledger: Ledger, tally: Tally): T[] {
  const kept: T[] = [];
  for (const item of items) {
    tally.total += 1;
    const { valid, reason } = checkEvidence(item.evidence, ledger);
    if (reason) {
      tally.dropped.push({ section, label: item.label, reason, evidence: item.evidence });
    } else {
      tally.grounded += 1;
      kept.push({ ...item, evidence: valid });
    }
  }
  return kept;
}

function validateMessaging(m: BriefDraft["messaging"], ledger: Ledger, tally: Tally): BriefDraft["messaging"] {
  if (m.tone.trim() === "" && m.phrases.length === 0) return { ...m, evidence: [] };
  tally.total += 1;
  const { valid, reason } = checkEvidence(m.evidence, ledger);
  if (reason) {
    tally.dropped.push({ section: "messaging", label: m.tone || "messaging", reason, evidence: m.evidence });
    return { tone: "", phrases: [], evidence: [] };
  }
  tally.grounded += 1;
  return { ...m, evidence: valid };
}

function validateSections(d: BriefDraft, ledger: Ledger, tally: Tally): BriefDraft {
  const f = <T extends Item>(items: readonly T[], section: string) => filterItems(items, section, ledger, tally);
  return {
    ...d,
    audienceProfile: {
      ...d.audienceProfile,
      affinities: f(d.audienceProfile.affinities, "audienceProfile.affinities"),
      ...(d.audienceProfile.demographics
        ? { demographics: f(d.audienceProfile.demographics, "audienceProfile.demographics") }
        : {}),
    },
    aesthetic: {
      palette: f(d.aesthetic.palette, "aesthetic.palette"),
      lighting: f(d.aesthetic.lighting, "aesthetic.lighting"),
      materials: f(d.aesthetic.materials, "aesthetic.materials"),
      referencePlaces: f(d.aesthetic.referencePlaces, "aesthetic.referencePlaces"),
    },
    sound: { ...d.sound, artists: f(d.sound.artists, "sound.artists") },
    pairings: f(d.pairings, "pairings"),
    ...(d.whereTheyAre
      ? { whereTheyAre: { ...d.whereTheyAre, hotspots: f(d.whereTheyAre.hotspots, "whereTheyAre.hotspots") } }
      : {}),
    messaging: validateMessaging(d.messaging, ledger, tally),
  };
}

/**
 * Pure: strips ungrounded items and computes groundingScore = grounded / submitted
 * (dropped items count against the score; an empty brief scores 0).
 */
export function validateBrief(draft: BriefDraft, mode: BriefMode, ledger: Ledger): ValidationResult {
  const tally: Tally = { total: 0, grounded: 0, dropped: [] };
  const sections = validateSections(draft, ledger, tally);
  const groundingScore = tally.total === 0 ? 0 : Math.round((tally.grounded / tally.total) * 100) / 100;
  return { brief: { ...sections, mode, groundingScore }, dropped: tally.dropped };
}
