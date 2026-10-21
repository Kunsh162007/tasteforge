import type { LlmProvider } from "@/lib/llm";
import type { QlooClient } from "@/lib/qloo";
import type { AgentEvent, TasteProof } from "./events";
import { logWarn } from "@/lib/log";
import { TimeoutError, withDeadline } from "./failure";
import { PIPELINE_TIMEOUT_MS, runPipeline, type PipelineOptions, type PipelineResult } from "./pipeline";
import type { Ledger } from "./ledger";
import { scoreProof, startBaseline, tasteforgePicks, type PickRef } from "./proof";

/** The brief is already on screen while the proof runs; live Qloo shortlist scoring takes 5 to 15 s for London-sized cities. */
export const PROOF_TIMEOUT_MS = 25_000;

export type GenerateOptions = PipelineOptions & {
  /** Set false to skip the Taste Proof (baseline LLM call and scoring). */
  readonly withProof?: boolean;
  readonly proofTimeoutMs?: number;
};

export type GenerateResult = PipelineResult & { readonly proof?: TasteProof };

function boundedChatJson(llm: LlmProvider, ms: number): LlmProvider {
  return {
    get name() {
      return llm.name;
    },
    chatJson: (req) => withDeadline(llm.chatJson(req), ms),
  };
}

type ProofRequest = {
  readonly llm: LlmProvider;
  readonly qloo: QlooClient;
  readonly prompt: string;
  readonly city?: string;
  readonly timeoutMs?: number;
  readonly proofTimeoutMs?: number;
  readonly onEvent?: (event: AgentEvent) => void;
};

/**
 * Starts the plain-LLM baseline alongside the main work so the proof only waits on scoring. `gate` (optional)
 * delays its Qloo lookups until Qloo is otherwise idle.
 */
export function beginBaseline(o: ProofRequest, gate?: Promise<Ledger | undefined>): Promise<PickRef[]> {
  const proofMs = o.proofTimeoutMs ?? PROOF_TIMEOUT_MS;
  return startBaseline(boundedChatJson(o.llm, (o.timeoutMs ?? PIPELINE_TIMEOUT_MS) + proofMs), o.qloo, { prompt: o.prompt, city: o.city }, gate);
}

/** Why a Taste Proof is missing, in words for the person looking at the brief. */
export const PROOF_UNAVAILABLE = {
  baseline: "the plain-language answer to compare against could not be fetched (the model did not return picks in time)",
  scoring: "Qloo could not score the picks in time",
  slow: "the comparison did not finish in time (Qloo or the model was slow)",
  failed: "the comparison hit an error",
} as const;

const unavailable = (reason: string): string => `unavailable: ${reason}`;

/** The proof stage: scores baseline and brief picks. A proof failure never fails the brief, and a missing proof always says why. */
export async function finishProof(o: ProofRequest, baseline: Promise<PickRef[]>, result: PipelineResult): Promise<GenerateResult> {
  if (!result.ok || !result.brief || !result.signals) return result;
  const proofMs = o.proofTimeoutMs ?? PROOF_TIMEOUT_MS;
  const emit = o.onEvent;
  emit?.({ type: "stage", stage: "proof", status: "start" });
  const stop = (reason: string): PipelineResult => {
    emit?.({ type: "stage", stage: "proof", status: "done", detail: unavailable(reason) });
    return result;
  };
  try {
    const picks = await withDeadline(baseline, proofMs);
    if (picks.length === 0) return stop(PROOF_UNAVAILABLE.baseline);
    const proof = await withDeadline(
      scoreProof({
        qloo: o.qloo,
        signals: result.signals,
        baseline: picks,
        tasteforge: tasteforgePicks(result.brief, result.ledger),
        city: result.city,
      }),
      proofMs,
    );
    if (!proof) return stop(PROOF_UNAVAILABLE.scoring);
    emit?.({ type: "stage", stage: "proof", status: "done", detail: `${proof.baselineNotFound} of ${proof.baseline.length} plain picks unverified` });
    emit?.({ type: "proof", proof });
    return { ...result, proof };
  } catch (e) {
    logWarn("taste proof unavailable", e);
    return stop(e instanceof TimeoutError ? PROOF_UNAVAILABLE.slow : PROOF_UNAVAILABLE.failed);
  }
}

/**
 * The full request: pipeline, then Taste Proof in the same stream. The plain-LLM baseline starts
 * as soon as the seeds are resolved, so the proof only waits on scoring. A proof failure never fails the brief.
 */
export async function generateBrief(o: GenerateOptions): Promise<GenerateResult> {
  let baseline: Promise<PickRef[]> | undefined;
  let release: (ledger?: Ledger) => void = () => undefined;
  const walked = new Promise<Ledger | undefined>((resolve) => {
    release = resolve;
  });
  // Only once the seeds resolved: a run that stops to ask the user a question must not spend a baseline LLM call.
  const onResolved = (): void => {
    if (o.withProof !== false) baseline ??= beginBaseline(o, walked);
    o.onResolved?.();
  };
  const onWalked = (ledger?: Ledger): void => {
    release(ledger);
    o.onWalked?.(ledger);
  };
  const result = await runPipeline({ ...o, onResolved, onWalked });
  release();
  return baseline ? finishProof(o, baseline, result) : result;
}
