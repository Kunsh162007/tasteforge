import type { Evidence, Ledger } from "../ledger";

/**
 * Colour cues: the tags of one brief's own evidence that say something about how the place should look, with a weight.
 * Style tags (decor and ambience of the reference places, already ranked by specificity against the city baseline
 * when the baseline arrived) count fully; the audience's genre, cuisine and concept tags count for less.
 */

export type CueSource = "style" | "genre" | "cuisine" | "audience";

export type Cue = {
  readonly name: string;
  readonly source: CueSource;
  readonly weight: number;
  /** The ledger record that holds the tag. */
  readonly evidence: string;
  readonly tagId: string;
};

export const SOURCE_WEIGHT: Readonly<Record<CueSource, number>> = { style: 1, genre: 0.85, cuisine: 0.5, audience: 0.6 };

/** A tag without a score still counts, a little less than a scored one. */
const UNSCORED = 0.5;
const SCORE_FLOOR = 0.35;
/** Position in the record's own ranking (most specific first) fades the weight gently. */
const RANK_FADE = 0.1;

const STYLE_PREFIXES = ["urn:tag:decor:", "urn:tag:ambience:"];
const CUISINE_PREFIXES = ["urn:tag:cuisine:", "urn:tag:specialty_dish:", "urn:tag:genre:place:"];
/** The kind of venue the user asked about ("cafe") counts as a cue only when it became a taste signal. */
const VENUE_PREFIX = "urn:tag:category:place:";
const MUSIC_PREFIX = "urn:tag:genre:music:";

const startsWithAny = (id: string, prefixes: readonly string[]): boolean => prefixes.some((p) => id.startsWith(p));

function sourceOf(tagId: string, chosen: ReadonlySet<string>): CueSource | undefined {
  if (startsWithAny(tagId, STYLE_PREFIXES)) return "style";
  if (!chosen.has(tagId) && !startsWithAny(tagId, CUISINE_PREFIXES)) return undefined;
  if (tagId.startsWith(MUSIC_PREFIX)) return "genre";
  if (startsWithAny(tagId, CUISINE_PREFIXES) || tagId.startsWith(VENUE_PREFIX)) return "cuisine";
  return "audience";
}

function weightOf(score: number | undefined, rank: number, source: CueSource): number {
  const base = score !== undefined && score > 0 ? SCORE_FLOOR + (1 - SCORE_FLOOR) * Math.min(score, 1) : UNSCORED;
  return base * SOURCE_WEIGHT[source] / (1 + RANK_FADE * rank);
}

const isUsableRecord = (e: Evidence): boolean => (e.tags?.length ?? 0) > 0;

/**
 * The cues behind a brief. Concept and genre tags count only when they were resolved as taste signals (`signalTagIds`);
 * every decor or ambience tag in the ledger counts. Each tag appears once, at its strongest.
 */
export function extractCues(ledger: Ledger, signalTagIds: readonly string[]): Cue[] {
  const chosen = new Set(signalTagIds);
  const best = new Map<string, Cue>();
  for (const record of ledger.records.filter(isUsableRecord)) {
    (record.tags ?? []).forEach((t, rank) => {
      const source = sourceOf(t.id, chosen);
      if (!source) return;
      const cue: Cue = { name: t.name, source, weight: weightOf(t.score, rank, source), evidence: record.id, tagId: t.id };
      const key = `${source}|${t.name.toLowerCase()}`;
      const prev = best.get(key);
      if (!prev || prev.weight < cue.weight) best.set(key, cue);
    });
  }
  return [...best.values()].sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
}
