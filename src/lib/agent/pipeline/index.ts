import type { ReverseGeocoder } from "@/lib/geo/nominatim";
import type { LlmProvider } from "@/lib/llm";
import type { QlooClient } from "@/lib/qloo";
import type { Brief, BriefMode, DroppedItem } from "../brief";
import type { AgentEvent, NeedsInputEvent, NeedsInputOption, SectionKey, StageName } from "../events";
import { describeFailure, withDeadline, type Failure } from "../failure";
import type { Ledger } from "../ledger";
import { validateBrief } from "../validator";
import { sectionConfidence } from "./confidence";
import { closeRun, createCtx, raceTimeout, snapshotStats, type PipelineCtx, type SectionStat } from "./context";
import { runCritic } from "./critic";
import { resolveFromPrompt, resolveSeeds, type Resolution, type Signals } from "./resolve";
import { extractSeeds } from "./seeds";
import { synthesizeBrief } from "./synthesis";
import { dropSeedEchoes } from "./guard";
import { OPTIONAL_BUDGET_MS, walkGraph } from "./walk";

/**
 * Live Qloo answers in 1 to 10 s per call with a tail past 30 s; a full brief makes about 15 calls,
 * 4 at a time, plus 3 LLM calls. 90 s plus the 25 s proof stays under the routes' 120 s maxDuration.
 */
const DEFAULT_PIPELINE_TIMEOUT_MS = 90_000;
const configuredTimeout = Number(process.env.PIPELINE_TIMEOUT_MS);
export const PIPELINE_TIMEOUT_MS =
  Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : DEFAULT_PIPELINE_TIMEOUT_MS;

/**
 * Graceful degradation: the data gathering stops waiting this long after the walk started (and always leaves the
 * synthesis its reserve before the run's own deadline) and the brief is written from what has arrived, with lower
 * section confidence. Both scale down with a short run deadline.
 */
export const WALK_BUDGET_MS = 28_000;
export const SYNTHESIS_RESERVE_MS = 30_000;
const WALK_BUDGET_SHARE = 0.45;
const RESERVE_SHARE = 0.33;
/** The critic's follow-up round is one fast query set: it may not run longer than this. */
export const CRITIC_BUDGET_MS = 10_000;

export type PipelineOptions = {
  readonly prompt: string;
  readonly mode: BriefMode;
  readonly city?: string;
  /** Qloo ids the user picked after a needs_input round. */
  readonly selections?: readonly string[];
  /** Already resolved taste signals (city comparison): skips seed extraction and Qloo resolution. */
  readonly presetSignals?: Signals;
  readonly llm: LlmProvider;
  readonly qloo: QlooClient;
  readonly onEvent?: (event: AgentEvent) => void;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
  /** Reverse geocoder for hotspots Qloo returns without names; omit in mock mode. */
  readonly geocode?: ReverseGeocoder;
  /** Called once the taste signals are resolved, before the graph walk: the point where side work (the Taste Proof baseline) may start. */
  readonly onResolved?: () => void;
  /** Called once the core graph walk has finished or given up (always, even when the run fails): Qloo is then free for side work. */
  readonly onWalked?: () => void;
  /** false: ambiguous names are resolved to the top match instead of asking (showcases, smoke). */
  readonly allowNeedsInput?: boolean;
};

export type RunResult = {
  readonly ok: boolean;
  readonly brief?: Brief;
  readonly dropped: readonly DroppedItem[];
  readonly ledger: Ledger;
  readonly error?: string;
  /** Key-free diagnostic for server logs / smoke tests, e.g. "groq rate_limit HTTP 429". */
  readonly cause?: string;
};

export type PipelineResult = RunResult & {
  readonly needsInput?: NeedsInputEvent;
  readonly signals?: Signals;
  readonly stats?: ReadonlyMap<SectionKey, SectionStat>;
  readonly city?: string;
};

/** Every LLM call shares the run deadline. */
function withinDeadline(llm: LlmProvider, deadlineAt: number): LlmProvider {
  const left = () => deadlineAt - Date.now();
  return {
    get name() {
      return llm.name;
    },
    chatJson: (req) => withDeadline(llm.chatJson(req), left()),
  };
}

/** The model that answered last, for brief metadata; scripted runs have none. */
export const modelField = (llm: LlmProvider): { model?: string } => (llm.name === "mock" ? {} : { model: llm.name });

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

function needsInputFor(res: Resolution): NeedsInputEvent {
  const options: NeedsInputOption[] = res.ambiguities.flatMap((a) => a.options);
  const names = res.ambiguities.map((a) => `"${a.seed}"`).join(", ");
  return {
    type: "needs_input",
    question: `${names} could mean more than one thing. Which did you mean?`,
    options,
  };
}

function expectedSections(city: string | undefined): SectionKey[] {
  return city ? ["audience", "aesthetic", "sound", "pairings", "where"] : ["audience", "sound", "pairings"];
}

const walkFoundData = (ctx: PipelineCtx): boolean => [...ctx.stats.values()].some((s) => s.usable > 0);

/**
 * Hybrid pipeline (plan section 8.1): seeds, resolve, parallel graph walk, critic, synthesis, then the
 * existing validator. 3 to 5 LLM calls per brief. Never throws: failures become an error event.
 */
export async function runPipeline(o: PipelineOptions): Promise<PipelineResult> {
  const emit = (e: AgentEvent): void => o.onEvent?.(e);
  const startedAt = Date.now();
  const deadlineAt = startedAt + (o.timeoutMs ?? PIPELINE_TIMEOUT_MS);
  let walkedSignalled = false;
  const walkedOnce = (): void => {
    if (walkedSignalled) return;
    walkedSignalled = true;
    o.onWalked?.();
  };
  const llm = withinDeadline(o.llm, deadlineAt);
  const ctx = createCtx({ qloo: o.qloo, emit, now: o.now, geocode: o.geocode });
  const stage = (name: StageName, status: "start" | "done", detail?: string): void =>
    emit({ type: "stage", stage: name, status, ...(detail ? { detail } : {}) });
  const fail = (failure: Failure): PipelineResult => {
    emit({ type: "error", message: failure.message, retryable: failure.retryable });
    return {
      ok: false,
      dropped: [],
      ledger: ctx.box.ledger,
      error: failure.message,
      ...(failure.cause ? { cause: failure.cause } : {}),
    };
  };

  try {
    const found = await seedAndResolve(ctx, o, llm, stage);
    if (found.kind === "needs_input") return { ok: false, dropped: [], ledger: ctx.box.ledger, needsInput: found.event, city: found.city };
    if (found.kind === "none") return fail(noSignalFailure(ctx));
    const { signals, city } = found;
    o.onResolved?.();

    stage("walk", "start");
    const budgetMs = o.timeoutMs ?? PIPELINE_TIMEOUT_MS;
    const walkDeadlineAt = Math.min(
      Date.now() + Math.min(WALK_BUDGET_MS, budgetMs * WALK_BUDGET_SHARE),
      deadlineAt - Math.min(SYNTHESIS_RESERVE_MS, budgetMs * RESERVE_SHARE),
    );
    const walked = await walkGraph(ctx, signals, city, { deferOptional: true, deadlineAt: walkDeadlineAt });
    walkedOnce();
    if (!walkFoundData(ctx)) {
      await closeRun(ctx, 0);
      return fail(noDataFailure(ctx));
    }
    const optionalUntil = Date.now() + OPTIONAL_BUDGET_MS;
    const pendingNow = ctx.pending.size;
    stage("walk", "done", `${plural(ctx.box.ledger.records.length, "evidence record")}${walked.partial ? `, partial: ${plural(pendingNow, "call")} cut off` : ""}`);

    stage("critic", "start");
    const critic = walked.partial
      ? { detail: "skipped, out of time" }
      : await boundedCritic(ctx, { llm, signals, city, expected: expectedSections(city) }, deadlineAt);
    stage("critic", "done", critic.detail);
    // Optional work (trending, extra TV, hotspot names) had the critic's time to land; it never delays synthesis further.
    await closeRun(ctx, optionalUntil - Date.now());

    stage("synthesis", "start");
    const draft = await synthesizeBrief({ llm, prompt: o.prompt, mode: o.mode, city, signals, ledger: ctx.box.ledger });
    const validated = validateBrief(draft, o.mode, ctx.box.ledger);
    const brief = dropSeedEchoes(validated.brief, ctx.guard.current);
    const dropped = validated.dropped;
    const stats = snapshotStats(ctx);
    const withConfidence = { ...brief, sectionConfidence: sectionConfidence(brief, stats), ...modelField(llm) };
    stage("synthesis", "done", `grounding ${Math.round(brief.groundingScore * 100)}%`);
    emit({ type: "brief", brief: withConfidence, dropped, evidence: ctx.box.ledger.records, signals });
    return { ok: true, brief: withConfidence, dropped, ledger: ctx.box.ledger, signals, stats, city };
  } catch (e) {
    return fail(describeFailure(e));
  } finally {
    walkedOnce();
  }
}

/** The critic with a hard sub-deadline: whatever it has not finished is left out and the run moves on to synthesis. */
async function boundedCritic(ctx: PipelineCtx, input: Parameters<typeof runCritic>[1], deadlineAt: number): Promise<{ readonly detail: string }> {
  const work = runCritic(ctx, input);
  const budget = Math.min(CRITIC_BUDGET_MS, (deadlineAt - Date.now()) * 0.25);
  let outcome: Awaited<ReturnType<typeof runCritic>> | undefined;
  const settled = await raceTimeout(work.then((r) => (outcome = r)), budget);
  return settled === "done" && outcome ? outcome : { detail: "follow-up cut short, kept the first pass" };
}

type StageFn = (name: StageName, status: "start" | "done", detail?: string) => void;

type Found =
  | { readonly kind: "signals"; readonly signals: Signals; readonly city: string | undefined }
  | { readonly kind: "needs_input"; readonly event: NeedsInputEvent; readonly city: string | undefined }
  | { readonly kind: "none" };

/** Stages 1 and 2: extract seeds and resolve them in Qloo, or take the preset signals as they are. */
async function seedAndResolve(ctx: PipelineCtx, o: PipelineOptions, llm: LlmProvider, stage: StageFn): Promise<Found> {
  if (o.presetSignals) {
    for (const name of ["seeds", "resolve"] as const) {
      stage(name, "start");
      stage(name, "done", "reused");
    }
    return { kind: "signals", signals: o.presetSignals, city: o.city };
  }
  stage("seeds", "start");
  const plan = await extractSeeds(llm, { prompt: o.prompt, mode: o.mode, city: o.city });
  const city = o.city ?? plan.city;
  stage("seeds", "done", `${plural(plan.seeds.length, "seed")}, ${plural(plan.tags.length, "concept")}${city ? `, ${city}` : ""}`);

  stage("resolve", "start");
  const resolution = await resolveSeeds(ctx, plan, o.selections ?? [], o.allowNeedsInput === false);
  if (resolution.ambiguities.length > 0) {
    stage("resolve", "done", "needs your input");
    const event = needsInputFor(resolution);
    ctx.emit(event);
    return { kind: "needs_input", event, city };
  }
  const signals = await ensureSignals(ctx, resolution.signals, o.prompt);
  if (!signals) return { kind: "none" };
  stage("resolve", "done", `${plural(signals.entityIds.length, "entity")}, ${plural(signals.tagIds.length, "tag")}`);
  return { kind: "signals", signals, city };
}

async function ensureSignals(ctx: PipelineCtx, found: Signals, prompt: string): Promise<Signals | undefined> {
  if (found.entityIds.length > 0 || found.tagIds.length > 0) return found;
  return resolveFromPrompt(ctx, prompt);
}

function noSignalFailure(ctx: PipelineCtx): Failure {
  const failure = ctx.errors.length > 0 ? describeFailure(ctx.errors[0]) : undefined;
  if (failure && ctx.errors.length === ctx.counter.n) return failure;
  return {
    message: "I could not match your request to anything in the taste graph. Try naming a few artists, brands or styles.",
    retryable: false,
  };
}

function noDataFailure(ctx: PipelineCtx): Failure {
  return {
    message: "The taste data service did not return anything usable. Please try again shortly.",
    retryable: ctx.errors.length > 0,
  };
}
