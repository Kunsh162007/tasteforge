import type { ReverseGeocoder } from "@/lib/geo/nominatim";
import type { LlmProvider } from "@/lib/llm";
import type { QlooClient } from "@/lib/qloo";
import type { Brief } from "../brief";
import type { AgentEvent, BriefSignals, SectionConfidence, SectionKey, StageName } from "../events";
import { describeFailure, withDeadline, type Failure } from "../failure";
import { beginBaseline, finishProof, type GenerateResult } from "../generate";
import type { Ledger } from "../ledger";
import { sectionConfidence } from "../pipeline/confidence";
import { createCtx, snapshotStats, type PipelineCtx } from "../pipeline/context";
import { modelField, PIPELINE_TIMEOUT_MS } from "../pipeline";
import { resolveFromPrompt, resolveSeeds, type Signals } from "../pipeline/resolve";
import { extractSeeds } from "../pipeline/seeds";
import { walkSections } from "../pipeline/walk";
import { validateBrief } from "../validator";
import { mergeRefinement } from "./merge";
import { buildPlan, type RefinePlan } from "./plan";
import type { RefineRequest } from "./request";
import { synthesizeRefinement } from "./synthesis";

export { MAX_REFINE_BODY_CHARS, parseRefineRequest, type RefineRequest } from "./request";

/** Extra taste signals a refine run may add on top of the original ones. */
const MAX_ENTITY_SIGNALS = 8;
const MAX_TAG_SIGNALS = 8;

export type RefineOptions = {
  readonly request: RefineRequest;
  readonly llm: LlmProvider;
  readonly qloo: QlooClient;
  readonly onEvent?: (event: AgentEvent) => void;
  readonly timeoutMs?: number;
  readonly geocode?: ReverseGeocoder;
  /** Set false to skip the Taste Proof re-run. */
  readonly withProof?: boolean;
};

const unique = <T>(list: readonly T[]): T[] => [...new Set(list)];

/** Names for `ids`, taken from a parallel base list; unknown ids get none. Misaligned lists are not trusted. */
function namesFor(ids: readonly string[], baseIds: readonly string[], baseNames: readonly string[]): string[] {
  if (baseNames.length !== baseIds.length) return [];
  const byId = new Map(baseIds.map((id, i) => [id, baseNames[i]]));
  return ids.flatMap((id) => {
    const name = byId.get(id);
    return name === undefined ? [] : [name];
  });
}

/** The original signals plus liked entities/tags, capped. Names are only known for the originals. */
export function withLikedSignals(base: BriefSignals, plan: RefinePlan): Signals {
  const entityIds = unique([...base.entityIds, ...plan.likedEntityIds]).slice(0, MAX_ENTITY_SIGNALS);
  const tagIds = unique([...base.tagIds, ...plan.likedTagIds]).slice(0, MAX_TAG_SIGNALS);
  return {
    entityIds,
    tagIds,
    entityNames: namesFor(entityIds, base.entityIds, base.entityNames),
    tagNames: namesFor(tagIds, base.tagIds, base.tagNames),
  };
}

async function baseSignals(ctx: PipelineCtx, o: RefineOptions, llm: LlmProvider): Promise<BriefSignals | undefined> {
  const given = o.request.signals;
  if (given && (given.entityIds.length > 0 || given.tagIds.length > 0)) return given;
  // Older showcase results carry no signals: re-derive them from the prompt (autoPick, never asks).
  const { prompt, mode, city } = o.request;
  const plan = await extractSeeds(llm, { prompt, mode, city });
  const resolution = await resolveSeeds(ctx, plan, [], true);
  const s = resolution.signals;
  if (s.entityIds.length > 0 || s.tagIds.length > 0) return s;
  return resolveFromPrompt(ctx, prompt);
}

function mergedConfidence(previous: Brief["sectionConfidence"] | Record<string, string> | undefined, fresh: SectionConfidence, refreshed: readonly SectionKey[]): SectionConfidence {
  const base = (previous ?? fresh) as SectionConfidence;
  return Object.fromEntries(
    (Object.keys(fresh) as SectionKey[]).map((k) => [k, refreshed.includes(k) ? fresh[k] : (base[k] ?? fresh[k])]),
  ) as SectionConfidence;
}

/** Raised inside a refine run to end it with a user-facing failure. */
class RefineStop extends Error {
  constructor(readonly failure: Failure) {
    super(failure.message);
  }
}

type Run = {
  readonly ctx: PipelineCtx;
  readonly llm: LlmProvider;
  readonly stage: (name: StageName, status: "start" | "done", detail?: string) => void;
};

function startRun(o: RefineOptions): Run {
  const emit = (e: AgentEvent): void => o.onEvent?.(e);
  const deadlineAt = Date.now() + (o.timeoutMs ?? PIPELINE_TIMEOUT_MS);
  const llm: LlmProvider = {
    get name() {
      return o.llm.name;
    },
    chatJson: (req) => withDeadline(o.llm.chatJson(req), deadlineAt - Date.now()),
  };
  const ctx = createCtx({ qloo: o.qloo, emit, geocode: o.geocode });
  ctx.box.ledger = { records: o.request.evidence };
  const stage: Run["stage"] = (name, status, detail) => emit({ type: "stage", stage: name, status, ...(detail ? { detail } : {}) });
  return { ctx, llm, stage };
}

type Prepared = { readonly plan: RefinePlan; readonly signals: Signals; readonly city: string | undefined };

/** Reads the feedback and the taste signals; ends the run when there is nothing to refine or no signals. */
async function prepare(run: Run, o: RefineOptions): Promise<Prepared> {
  const { request } = o;
  const plan = buildPlan(request.brief, request.evidence, request.feedback);
  if (plan.sections.length === 0) {
    throw new RefineStop({ message: "None of the marked items were found in this brief. Mark an item and try again.", retryable: false });
  }
  const base = await baseSignals(run.ctx, o, run.llm);
  if (!base) throw new RefineStop({ message: "I could not rebuild the taste signals for this brief. Please start a new brief.", retryable: false });
  return { plan, signals: withLikedSignals(base, plan), city: request.city ?? request.brief.whereTheyAre?.city };
}

async function walkStage(run: Run, p: Prepared): Promise<void> {
  const { ctx } = run;
  run.stage("walk", "start");
  await walkSections(ctx, p.plan.sections, p.signals, p.city, p.plan.exclusions);
  const usable = [...snapshotStats(ctx).values()].some((s) => s.usable > 0);
  if (!usable && ctx.errors.length > 0 && ctx.errors.length === ctx.counter.n) throw new RefineStop(describeFailure(ctx.errors[0]));
  run.stage("walk", "done", `${p.plan.sections.length} section${p.plan.sections.length === 1 ? "" : "s"} refreshed`);
}

type Refined = { readonly brief: Brief; readonly dropped: GenerateResult["dropped"]; readonly ledger: Ledger; readonly stats: ReturnType<typeof snapshotStats> };

async function synthesisStage(run: Run, o: RefineOptions, p: Prepared): Promise<Refined> {
  const { request } = o;
  run.stage("synthesis", "start");
  const ledger: Ledger = run.ctx.box.ledger;
  const existingIds = new Set(request.evidence.map((e) => e.id));
  const draft = await synthesizeRefinement({ llm: run.llm, prompt: request.prompt, mode: request.mode, city: p.city, signals: p.signals, ledger, previous: request.brief, plan: p.plan, existingIds });
  const merged = mergeRefinement(request.brief, draft, p.plan);
  const { brief, dropped } = validateBrief(merged, request.mode, ledger);
  const stats = snapshotStats(run.ctx);
  const confidence = mergedConfidence(request.brief.sectionConfidence, sectionConfidence(brief, stats), p.plan.sections);
  run.stage("synthesis", "done", `grounding ${Math.round(brief.groundingScore * 100)}%`);
  return { brief: { ...brief, sectionConfidence: confidence, ...modelField(run.llm) }, dropped, ledger, stats };
}

/**
 * Refine loop: re-walks only the sections that contain disliked items (with exclusions and liked entities as
 * extra signals), runs one synthesis call, merges so liked and locked items stay verbatim, validates with the
 * same validator, then re-runs Taste Proof. Emits the same SSE events as a normal run. Never throws.
 */
export async function refineBrief(o: RefineOptions): Promise<GenerateResult> {
  const run = startRun(o);
  const proofRequest = { llm: o.llm, qloo: o.qloo, prompt: o.request.prompt, city: o.request.city, timeoutMs: o.timeoutMs, onEvent: o.onEvent };
  try {
    const prepared = await prepare(run, o);
    // The baseline only starts once there is something to refine and signals to score against.
    const baseline = o.withProof === false ? undefined : beginBaseline(proofRequest);
    await walkStage(run, prepared);
    const refined = await synthesisStage(run, o, prepared);
    o.onEvent?.({ type: "brief", brief: refined.brief, dropped: refined.dropped, evidence: refined.ledger.records, signals: prepared.signals });
    const result: GenerateResult = { ok: true, ...refined, signals: prepared.signals, city: prepared.city };
    return baseline ? await finishProof(proofRequest, baseline, result) : result;
  } catch (e) {
    const failure = e instanceof RefineStop ? e.failure : describeFailure(e);
    o.onEvent?.({ type: "error", message: failure.message, retryable: failure.retryable });
    return { ok: false, dropped: [], ledger: run.ctx.box.ledger, error: failure.message, ...(failure.cause ? { cause: failure.cause } : {}) };
  }
}
