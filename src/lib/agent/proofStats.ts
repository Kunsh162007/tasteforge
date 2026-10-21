import type { ScoredPick } from "./events";

/** How a plain-LLM pick held up in Qloo. Older proofs carry no status; for them "scored" is the only evidence of "found". */
export type PickStatus = NonNullable<ScoredPick["status"]>;

export const statusOf = (p: Pick<ScoredPick, "status" | "affinity">): PickStatus => p.status ?? (p.affinity === null ? "unverified" : "verified");

/** A pick Qloo could not verify in the city: not in its data, listed under another type, or only in another city. */
export const isUnverified = (p: Pick<ScoredPick, "status" | "affinity">): boolean => statusOf(p) !== "verified";

export type Breakdown = { readonly verified: number; readonly unverified: number; readonly wrongType: number; readonly otherCity: number };

export function breakdownOf(picks: readonly Pick<ScoredPick, "status" | "affinity">[]): Breakdown {
  const count = (s: PickStatus): number => picks.filter((p) => statusOf(p) === s).length;
  return { verified: count("verified"), unverified: count("unverified"), wrongType: count("wrong_type"), otherCity: count("other_city") };
}

/** "3 not in Qloo's data, 2 listed under another type and 1 only in another city". */
export function describeBreakdown(b: Breakdown, city?: string): string {
  const parts = [
    b.unverified > 0 ? `${b.unverified} not in Qloo's data${city ? ` for ${city}` : ""}` : undefined,
    b.wrongType > 0 ? `${b.wrongType} listed under another type` : undefined,
    b.otherCity > 0 ? `${b.otherCity} only in another city` : undefined,
  ].filter((p): p is string => p !== undefined);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
