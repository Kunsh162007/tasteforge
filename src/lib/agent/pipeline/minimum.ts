import type { Brief } from "../brief";
import type { Evidence, Ledger } from "../ledger";
import { isUsable } from "./context";

/**
 * Minimum content per brief section. Repeat runs of one prompt produced briefs with 0 or 1 picks in a section
 * (London ceramics: 0, then 10) because one narrow Qloo query came back thin and nothing widened it. The pipeline checks
 * these floors after the walk (and widens), and again after synthesis (and repairs).
 */

export type ContentKind = "place" | "artist" | "brand" | "style";

export const MINIMUMS: Readonly<Record<ContentKind, number>> = { place: 4, artist: 5, brand: 3, style: 3 };

/** The decor and ambience tags that colour the palette come from entity tag analysis of the top places. */
const isStyleRecord = (r: Evidence): boolean => r.endpoint.includes("urn:tag") && /decor|ambience/.test(r.params.tag_types ?? "");
const isInsightsOf = (r: Evidence, kind: ContentKind): boolean => r.endpoint === "/v2/insights" && r.params.type === kind;

/** Distinct usable Qloo results the ledger holds for one kind of content. */
export function countContent(ledger: Ledger, kind: ContentKind): number {
  const usable = ledger.records.filter(isUsable);
  if (kind === "style") {
    return new Set(usable.filter(isStyleRecord).flatMap((r) => (r.tags ?? []).map((t) => t.id))).size;
  }
  return new Set(usable.filter((r) => isInsightsOf(r, kind)).flatMap((r) => (r.entities ?? []).map((e) => e.id))).size;
}

export type Shortfall = { readonly kind: ContentKind; readonly have: number; readonly need: number };

/** Kinds of content the ledger holds too little of. Place content (places, palette tags) only counts when a city is known. */
export function shortfalls(ledger: Ledger, city: string | undefined): Shortfall[] {
  const kinds: ContentKind[] = city ? ["place", "artist", "brand", "style"] : ["artist", "brand"];
  return kinds.flatMap((kind) => {
    const have = countContent(ledger, kind);
    return have < MINIMUMS[kind] ? [{ kind, have, need: MINIMUMS[kind] }] : [];
  });
}

/** Ledger entities of one kind (all records, first seen first), for repairing a brief section from evidence. */
export function ledgerEntities(ledger: Ledger, kind: Exclude<ContentKind, "style">): { entity: NonNullable<Evidence["entities"]>[number]; evidence: string }[] {
  const seen = new Set<string>();
  return ledger.records
    .filter((r) => isUsable(r) && isInsightsOf(r, kind))
    .flatMap((r) => (r.entities ?? []).map((entity) => ({ entity, evidence: r.id })))
    .filter(({ entity }) => (seen.has(entity.id) ? false : (seen.add(entity.id), true)));
}

export type BriefShortfall = { readonly kind: Exclude<ContentKind, "style">; readonly have: number; readonly need: number };

/** Items of the brief that are Qloo entities of `kind` (pairings also hold menu ideas, which have no entity id). */
export function briefCount(brief: Pick<Brief, "aesthetic" | "sound" | "pairings">, kind: Exclude<ContentKind, "style">, ledger: Ledger): number {
  if (kind === "place") return brief.aesthetic.referencePlaces.length;
  if (kind === "artist") return brief.sound.artists.length;
  const brands = new Set(ledgerEntities(ledger, "brand").map((x) => x.entity.id));
  return brief.pairings.filter((i) => i.qlooId !== undefined && brands.has(i.qlooId)).length;
}

/** Sections the finished brief fills below the floor although the ledger holds enough results to fill them. */
export function briefShortfalls(brief: Pick<Brief, "aesthetic" | "sound" | "pairings">, ledger: Ledger, city: string | undefined): BriefShortfall[] {
  const kinds: BriefShortfall["kind"][] = city ? ["place", "artist", "brand"] : ["artist", "brand"];
  return kinds.flatMap((kind) => {
    const have = briefCount(brief, kind, ledger);
    const available = ledgerEntities(ledger, kind).length;
    const need = Math.min(MINIMUMS[kind], available);
    return have < need ? [{ kind, have, need }] : [];
  });
}
