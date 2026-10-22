import { lookupCityCentre } from "@/lib/geo/forward";
import type { GeoArea, ReverseGeocoder } from "@/lib/geo/nominatim";
import type { QlooClient } from "@/lib/qloo";
import type { AgentEvent, SectionKey } from "../events";
import type { BrandScope } from "../brandScope";
import { createCentreResolver, type CentreResolver } from "../cityCentre";
import { addEvidence, byAffinityThenId, EMPTY_LEDGER, type Evidence, type EvidenceDraft, type Ledger } from "../ledger";
import { executeTool } from "../tools";
import { isUnnamedArea, withEntities, withHeatmapEntities } from "../summaries";
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
  /** Calls that were still running when the time budget ran out and were left out of the brief. */
  readonly skipped?: number;
};

type StatAcc = { calls: number; usable: number; items: number; failed: number; fallbacks: string[]; skipped: number };

/** A Qloo call that has started and not yet reported back. */
type PendingCall = { readonly name: string; readonly section: SectionKey | undefined; readonly startedAt: number };

export type PipelineCtx = {
  readonly qloo: QlooClient;
  readonly emit: (event: AgentEvent) => void;
  readonly now?: () => Date;
  /** Names heatmap hotspots Qloo returned as bare coordinates. Absent in mock mode. */
  readonly geocode?: ReverseGeocoder;
  /** Brand pairings: consumer and hospitality brands only, unless the request is about media or education. */
  readonly brandScope: BrandScope;
  /** Centre and reach of the requested city, for the heatmap. */
  readonly centreOf: CentreResolver;
  /** Reverse lookups of heatmap cells, by rounded position; started once, shared by the prefetch and the final naming. */
  readonly areas: Map<string, Promise<GeoArea | undefined>>;
  readonly box: { ledger: Ledger };
  readonly stats: Map<SectionKey, StatAcc>;
  readonly counter: { n: number };
  /** Every error thrown by a Qloo call, kept to decide whether the data source is down. */
  readonly errors: unknown[];
  /** Seeds and city the results are cleaned against; set once the taste signals are known. */
  readonly guard: { current: Guard };
  /** Tags and dishes of the places seen so far (filled by the wrapped Qloo client). */
  readonly facts: Map<string, PlaceFacts>;
  /** Work that may finish late without holding the brief back (trending, extra film/TV, hotspot names). */
  readonly optional: Promise<unknown>[];
  /** Calls started and not yet answered, by tool-call id. */
  readonly pending: Map<string, PendingCall>;
  /** Once closed (just before synthesis) late answers are dropped, so the ledger the brief cites stays fixed. */
  readonly run: { closed: boolean };
};

export function createCtx(o: Pick<PipelineCtx, "qloo" | "emit" | "now" | "geocode"> & { readonly brandScope?: BrandScope; readonly centreOf?: CentreResolver }): PipelineCtx {
  const facts = new Map<string, PlaceFacts>();
  return {
    ...o,
    brandScope: o.brandScope ?? "consumer",
    // A geocoder exists only for live data; mock runs rely on the built-in table of cities.
    centreOf: o.centreOf ?? createCentreResolver(o.geocode ? lookupCityCentre : undefined),
    qloo: withPlaceFacts(o.qloo, facts),
    facts,
    areas: new Map(),
    box: { ledger: EMPTY_LEDGER },
    stats: new Map(),
    counter: { n: 0 },
    errors: [],
    optional: [],
    pending: new Map(),
    run: { closed: false },
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
  const media = type === "movie" || type === "tv_show";
  // Best fit first, ties by id: the same results always become the same record, whatever order Qloo answered in.
  const kept = [...(media ? keepAboveMedian(scrubbed.kept) : scrubbed.kept)].sort(byAffinityThenId);
  if (kept.length === draft.entities.length && kept.every((e, i) => e.id === draft.entities?.[i].id)) return draft;
  const why = scrubbed.removedOffCity > 0 ? `Every place found was outside ${guard.city ?? "the city"}.` : "Only your own seeds came back.";
  return withEntities(draft, kept, why);
}

const NO_RESULTS = "No results";

export const isUsable = (e: Pick<Evidence, "summary">): boolean => !e.summary.startsWith(NO_RESULTS);

export const itemCount = (e: Evidence): number => e.entities?.length ?? e.tags?.length ?? (isUsable(e) ? 1 : 0);

function acc(ctx: PipelineCtx, section: SectionKey): StatAcc {
  const existing = ctx.stats.get(section);
  if (existing) return existing;
  const fresh: StatAcc = { calls: 0, usable: 0, items: 0, failed: 0, fallbacks: [], skipped: 0 };
  ctx.stats.set(section, fresh);
  return fresh;
}

/** Counts a record that was empty when it arrived but has since been filled in (see walk.ts). */
export function noteFilled(ctx: PipelineCtx, section: SectionKey, items: number): void {
  if (ctx.run.closed) return;
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
  if (ctx.run.closed) return;
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
  const started = Date.now();
  ctx.emit({ type: "tool_call", id, name: call.name, args: call.args });
  const stat = section ? acc(ctx, section) : undefined;
  if (stat) stat.calls += 1;
  ctx.pending.set(id, { name: call.name, section, startedAt: started });
  try {
    // Await first: reading the ledger before the await would let parallel calls overwrite each other.
    const draft = await produce();
    // The run moved on (time budget): the call was already reported as left out, and the ledger is final.
    if (ctx.run.closed) return undefined;
    ctx.pending.delete(id);
    const { ledger, evidence } = addEvidence(ctx.box.ledger, draft);
    ctx.box.ledger = ledger;
    if (stat && isUsable(evidence)) {
      stat.usable += 1;
      stat.items += itemCount(evidence);
    }
    ctx.emit({ type: "tool_result", id, name: call.name, ok: true, summary: evidence.summary, evidenceId: evidence.id, durationMs: Date.now() - started });
    return evidence;
  } catch (e) {
    if (ctx.run.closed) return undefined;
    ctx.pending.delete(id);
    if (stat) stat.failed += 1;
    ctx.errors.push(e);
    ctx.emit({ type: "tool_result", id, name: call.name, ok: false, summary: failureText(e), durationMs: Date.now() - started });
    return undefined;
  }
}

/**
 * Runs a registered agent tool (schema-validated args) as a recorded graph-walk step. An `optional` call is also
 * tracked in `ctx.optional`: the caller need not await it, and `closeRun` decides how long it may still take.
 */
export function viaTool(
  ctx: PipelineCtx,
  section: SectionKey,
  name: string,
  args: Readonly<Record<string, unknown>>,
  opts: { readonly optional?: boolean } = {},
): Promise<Evidence | undefined> {
  const work = recordDraft(ctx, section, { name, args }, async () => {
    const centre = name === "qloo_heatmap" && typeof args.location === "string" ? await ctx.centreOf(args.location) : undefined;
    const outcome = await executeTool({ name, args }, { qloo: ctx.qloo, ledger: EMPTY_LEDGER, now: ctx.now, brandScope: ctx.brandScope, ...(centre ? { centre } : {}) });
    if (outcome.isError || !outcome.evidence) {
      if (outcome.cause !== undefined) throw outcome.cause;
      const parsed = JSON.parse(outcome.content) as { error?: string };
      throw new Error(parsed.error ?? "The call failed.");
    }
    const { id: _discarded, ...draft } = outcome.evidence;
    void _discarded;
    return scrubDraft(draft, { name, args }, ctx.guard.current);
  });
  if (opts.optional) ctx.optional.push(work);
  return work;
}

/** The value of `work`, or undefined if it takes longer than `ms`. */
export async function raceValue<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number): Promise<"timeout"> =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve("timeout"), ms);
    t.unref?.();
  });

/**
 * Resolves with "done" when `work` settles first, or "timeout" after `ms`. The work is left running either way.
 * (A bare timer is fine here: it is unref'd, and the loser of the race is simply ignored.)
 */
export async function raceTimeout(work: Promise<unknown>, ms: number): Promise<"done" | "timeout"> {
  if (ms <= 0) return "timeout";
  return Promise.race([work.then(() => "done" as const, () => "done" as const), sleep(ms)]);
}

/**
 * Ends the run's data gathering. Optional work gets up to `optionalWaitMs` more to land; after that the run is
 * closed: calls still in flight are reported as left out (so the trail never shows a call that never ends) and any
 * late answer is dropped. Returns how many calls were left out.
 */
export async function closeRun(ctx: PipelineCtx, optionalWaitMs: number, beforeClose?: () => Promise<void>): Promise<number> {
  if (ctx.optional.length > 0) await raceTimeout(Promise.allSettled(ctx.optional), optionalWaitMs);
  await beforeClose?.().catch(() => undefined);
  withoutUnnamedHotspots(ctx);
  ctx.run.closed = true;
  let skipped = 0;
  for (const [id, call] of ctx.pending) {
    skipped += 1;
    if (call.section) acc(ctx, call.section).skipped += 1;
    ctx.emit({
      type: "tool_result",
      id,
      name: call.name,
      ok: false,
      summary: "Left out: no answer within the time budget.",
      durationMs: Date.now() - call.startedAt,
    });
  }
  ctx.pending.clear();
  return skipped;
}

/** A hotspot that never got a neighbourhood name is not shown (its placeholder is raw coordinates). Runs once, as the run closes. */
function withoutUnnamedHotspots(ctx: PipelineCtx): void {
  ctx.box.ledger = {
    records: ctx.box.ledger.records.map((r) => {
      if (!r.endpoint.includes("heatmap") || !r.entities?.some((e) => isUnnamedArea(e.name))) return r;
      return withHeatmapEntities(r, r.entities.filter((e) => !isUnnamedArea(e.name)));
    }),
  };
}
