import { nameTokens, type Verdict, type VerifyStatus } from "./verify";

/**
 * Pure helpers for the verification benchmark (scripts/benchmark.mts, docs/BENCHMARK.md): how many of a plain LLM's picks
 * Qloo can verify in the requested city, how the rest split up, and how much two runs agree.
 */

export type BenchKind = "artist" | "place" | "brand";
export const BENCH_KINDS: readonly BenchKind[] = ["artist", "place", "brand"];

export type PickOutcome = {
  readonly kind: BenchKind;
  readonly name: string;
  readonly status: VerifyStatus;
  readonly qlooId?: string;
  /** For a wrong-type status: the type Qloo lists a same-named entity under. */
  readonly matchedKind?: string;
  /** Qloo's fit with the audience for verified picks; null when unscored. A sanity check only: affinity is normalized per query. */
  readonly affinity: number | null;
};

export const outcomeOf = (kind: BenchKind, name: string, v: Verdict, affinity: number | null = null): PickOutcome => ({
  kind,
  name,
  status: v.status,
  ...(v.qlooId ? { qlooId: v.qlooId } : {}),
  ...(v.matchedKind ? { matchedKind: v.matchedKind } : {}),
  affinity,
});

/**
 * Where a pick that could not be verified ends up. `invented` and `real_not_in_qloo` need a human (or a web search) to
 * tell apart, so they come from a hand-kept audit; the other two follow from the status.
 */
export type MissClass = "likely_invented" | "real_not_in_qloo" | "real_other_city" | "wrong_type" | "unclassified";
export const MISS_CLASSES: readonly MissClass[] = ["likely_invented", "real_not_in_qloo", "wrong_type", "real_other_city", "unclassified"];

export type AuditEntry = { readonly class: "likely_invented" | "real_not_in_qloo" | "real_other_city"; readonly note?: string };
/** Hand audit of unverified picks, keyed by `${kind}|${normalized name}`. */
export type Audit = Readonly<Record<string, AuditEntry>>;

export const auditKey = (kind: BenchKind, name: string): string => `${kind}|${nameTokens(name).join(" ")}`;

export function classifyMiss(p: PickOutcome, audit: Audit = {}): MissClass | undefined {
  if (p.status === "verified") return undefined;
  const audited = audit[auditKey(p.kind, p.name)];
  if (audited) return audited.class;
  if (p.status === "wrong_type") return "wrong_type";
  if (p.status === "other_city") return "real_other_city";
  return "unclassified";
}

export type KindSummary = {
  readonly picks: number;
  readonly verified: number;
  readonly unverified: number;
  readonly wrongType: number;
  readonly otherCity: number;
  /** Picks Qloo could not verify in the city (everything but verified). */
  readonly couldntVerify: number;
  readonly couldntVerifyRate: number | null;
  readonly scored: number;
  readonly meanFit: number | null;
};

const rate = (n: number, d: number): number | null => (d === 0 ? null : n / d);
const mean = (xs: readonly number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

export function summarizeKind(picks: readonly PickOutcome[]): KindSummary {
  const count = (s: VerifyStatus): number => picks.filter((p) => p.status === s).length;
  const verified = count("verified");
  const fits = picks.flatMap((p) => (p.status === "verified" && p.affinity !== null ? [p.affinity] : []));
  return {
    picks: picks.length,
    verified,
    unverified: count("unverified"),
    wrongType: count("wrong_type"),
    otherCity: count("other_city"),
    couldntVerify: picks.length - verified,
    couldntVerifyRate: rate(picks.length - verified, picks.length),
    scored: fits.length,
    meanFit: mean(fits),
  };
}

export const summarizeByKind = (picks: readonly PickOutcome[]): Record<BenchKind, KindSummary> => ({
  artist: summarizeKind(picks.filter((p) => p.kind === "artist")),
  place: summarizeKind(picks.filter((p) => p.kind === "place")),
  brand: summarizeKind(picks.filter((p) => p.kind === "brand")),
});

/** Counts of the unverified picks per class. */
export function missBreakdown(picks: readonly PickOutcome[], audit: Audit = {}): Record<MissClass, number> {
  const out: Record<MissClass, number> = { likely_invented: 0, real_not_in_qloo: 0, wrong_type: 0, real_other_city: 0, unclassified: 0 };
  for (const p of picks) {
    const c = classifyMiss(p, audit);
    if (c) out[c] += 1;
  }
  return out;
}

/** Overlap of two pick lists (Jaccard on normalised names): 1 = identical, 0 = nothing in common; null when both are empty. */
export function overlap(a: readonly string[], b: readonly string[]): number | null {
  const x = new Set(a.map((n) => nameTokens(n).join(" ")));
  const y = new Set(b.map((n) => nameTokens(n).join(" ")));
  const union = new Set([...x, ...y]).size;
  if (union === 0) return null;
  return [...x].filter((n) => y.has(n)).length / union;
}
