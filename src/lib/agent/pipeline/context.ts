import type { ReverseGeocoder } from "@/lib/geo/nominatim";
import type { QlooClient } from "@/lib/qloo";
import type { AgentEvent, SectionKey } from "../events";
import { addEvidence, EMPTY_LEDGER, type Evidence, type EvidenceDraft, type Ledger } from "../ledger";
import { executeTool } from "../tools";
import { withEntities } from "../summaries";
import { withPlaceFacts, type PlaceFacts } from "./placeFacts";
import { createGuard, keepAboveMedian, scrubEntities, type Guard } from "./guard";

/**
 * Shared state of one pipeline run. The ledger box and stats are the only mutable cells: parallel
 * graph-walk calls append to them as they finish, so evidence ids are assigned in completion order.
 * The records themselves stay immutable.
 */

export type SectionStat = {
  readonly section: SectionKey;
  /** Qloo calls attempted for this section (initial walk plus critic follow-ups). */
  readonly calls: number;
  /** Calls that returned something usable (not empty, not failed). */
  readonly usable: number;
  /** Total entities/tags/cells returned across usable calls. */
  readonly items: number;
  readonly failed: number;
  /** Fallback strategies the critic applied (drop_location, tags_only, ...). */
  readonly fallbacks: readonly string[];
};

type StatAcc = { calls: number; usable: number; items: number; failed: number; fallbacks: string[] };

export type PipelineCtx = {
  readonly qloo: QlooClient;
  readonly emit: (event: AgentEvent) => void;
  readonly now?: () => Date;
  /** Names heatmap hotspots Qloo returned as bare coordinates. Absent in mock mode. */
  readonly geocode?: ReverseGeocoder;
  readonly box: { ledger: Ledger };
  readonly stats: Map<SectionKey, StatAcc>;
  readonly counter: { n: number };
  /** Every error thrown by a Qloo call, kept to decide whether the data source is down. */
  readonly errors: unknown[];
  /** Seeds and city the results are cleaned against; set once the taste signals are known. */
  readonly guard: { current: Guard };
  /** Tags and dishes of the places seen so far (filled by the wrapped Qloo client). */
  readonly facts: Map<string, PlaceFacts>;
};

export function createCtx(o: Pick<PipelineCtx, "qloo" | "emit" | "now" | "geocode">): PipelineCtx {
  const facts = new Map<string, PlaceFacts>();
  return {
    ...o,
    qloo: withPlaceFacts(o.qloo, facts),
    facts,
    box: { ledger: EMPTY_LEDGER },
    stats: new Map(),
    counter: { n: 0 },
    errors: [],
    guard: { current: createGuard({ entityIds: [], entityNames: [] }) },
  };
}

/** Tells the run which seeds to keep out of the results and which city places must belong to. */
export function setGuard(ctx: PipelineCtx, signals: { readonly entityIds: readonly string[]; readonly entityNames: readonly string[] }, city?: string): void {
  ctx.guard.current = createGuard(signals, city);
}

/** Drops seed echoes and off-city places from an insights draft, and film/TV picks below the batch median. */
function scrubDraft(draft: EvidenceDraft, call: { readonly name: string; readonly args: Readonly<Record<string, unknown>> }, guard: Guard): EvidenceDraft {
  if (call.name !== "qloo_insights" || !draft.entities || draft.entities.length === 0) return draft;
  const type = String(call.args.type);
  const scrubbed = scrubEntities(draft.entities, guard, type === "place");
  const kept = type === "movie" || type === "tv_show" ? keepAboveMedian(scrubbed.kept) : scrubbed.kept;
  if (kept.length === draft.entities.length) return draft;
  const why = scrubbed.removedOffCity > 0 ? `Every place found was outside ${guard.city ?? "the city"}.` : "Only your own seeds came back.";
  return withEntities(draft, kept, why);
}

const NO_RESULTS = "No results";

export const isUsable = (e: Pick<Evidence, "summary">): boolean => !e.summary.startsWith(NO_RESULTS);

export const itemCount = (e: Evidence): number => e.entities?.length ?? e.tags?.length ?? (isUsable(e) ? 1 : 0);

function acc(ctx: PipelineCtx, section: SectionKey): StatAcc {
  const existing = ctx.stats.get(section);
  if (existing) return existing;
  const fresh: StatAcc = { calls: 0, usable: 0, items: 0, failed: 0, fallbacks: [] };
  ctx.stats.set(section, fresh);
  return fresh;
}

/** Counts a record that was empty when it arrived but has since been filled in (see walk.ts). */
export function noteFilled(ctx: PipelineCtx, section: SectionKey, items: number): void {
  const a = acc(ctx, section);
  a.usable += 1;
  a.items += items;
}

export function noteFallback(ctx: PipelineCtx, section: SectionKey, strategy: string): void {
  acc(ctx, section).fallbacks.push(strategy);
}

export function snapshotStats(ctx: PipelineCtx): ReadonlyMap<SectionKey, SectionStat> {
  return new Map([...ctx.stats].map(([section, a]) => [section, { section, ...a, fallbacks: [...a.fallbacks] }]));
}

/** Swaps one stored record for an updated copy with the same id (the ledger itself stays immutable). */
export function replaceEvidence(ctx: PipelineCtx, updated: Evidence): void {
  ctx.box.ledger = { records: ctx.box.ledger.records.map((r) => (r.id === updated.id ? updated : r)) };
}

function failureText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "The call failed.";
}

/**
 * Runs one Qloo call as a visible step: emits tool_call, then tool_result, and records the evidence
 * draft in the ledger. Failures become a failed tool_result (never thrown) so one bad call cannot
 * sink the whole walk. Resolves to the stored evidence, or undefined on failure.
 */
export async function recordDraft(
  ctx: PipelineCtx,
  section: SectionKey | undefined,
  call: { readonly name: string; readonly args: Readonly<Record<string, unknown>> },
  produce: () => Promise<EvidenceDraft>,
): Promise<Evidence | undefined> {
  ctx.counter.n += 1;
  const id = `p_${ctx.counter.n}`;
  ctx.emit({ type: "tool_call", id, name: call.name, args: call.args });
  const stat = section ? acc(ctx, section) : undefined;
  if (stat) stat.calls += 1;
  try {
    // Await first: reading the ledger before the await would let parallel calls overwrite each other.
    const draft = await produce();
    const { ledger, evidence } = addEvidence(ctx.box.ledger, draft);
    ctx.box.ledger = ledger;
    if (stat && isUsable(evidence)) {
      stat.usable += 1;
      stat.items += itemCount(evidence);
    }
    ctx.emit({ type: "tool_result", id, name: call.name, ok: true, summary: evidence.summary, evidenceId: evidence.id });
    return evidence;
  } catch (e) {
    if (stat) stat.failed += 1;
    ctx.errors.push(e);
    ctx.emit({ type: "tool_result", id, name: call.name, ok: false, summary: failureText(e) });
    return undefined;
  }
}

/** Runs a registered agent tool (schema-validated args) as a recorded graph-walk step. */
export function viaTool(
  ctx: PipelineCtx,
  section: SectionKey,
  name: string,
  args: Readonly<Record<string, unknown>>,
): Promise<Evidence | undefined> {
  return recordDraft(ctx, section, { name, args }, async () => {
    const outcome = await executeTool({ name, args }, { qloo: ctx.qloo, ledger: EMPTY_LEDGER, now: ctx.now });
    if (outcome.isError || !outcome.evidence) {
      if (outcome.cause !== undefined) throw outcome.cause;
      const parsed = JSON.parse(outcome.content) as { error?: string };
      throw new Error(parsed.error ?? "The call failed.");
    }
    const { id: _discarded, ...draft } = outcome.evidence;
    void _discarded;
    return scrubDraft(draft, { name, args }, ctx.guard.current);
  });
}
