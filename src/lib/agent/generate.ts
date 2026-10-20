import type { LlmProvider } from "@/lib/llm";
import type { QlooClient } from "@/lib/qloo";
import type { AgentEvent, TasteProof } from "./events";
import { logWarn } from "@/lib/log";
import { withDeadline } from "./failure";
import { PIPELINE_TIMEOUT_MS, runPipeline, type PipelineOptions, type PipelineResult } from "./pipeline";
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

/** Starts the plain-LLM baseline alongside the main work so the proof only waits on scoring. */
export function beginBaseline(o: ProofRequest): Promise<PickRef[]> {
  const proofMs = o.proofTimeoutMs ?? PROOF_TIMEOUT_MS;
  return startBaseline(boundedChatJson(o.llm, (o.timeoutMs ?? PIPELINE_TIMEOUT_MS) + proofMs), o.qloo, { prompt: o.prompt, city: o.city });
}

/** The proof stage: scores baseline and brief picks. A proof failure never fails the brief. */
export async function finishProof(o: ProofRequest, baseline: Promise<PickRef[]>, result: PipelineResult): Promise<GenerateResult> {
  if (!result.ok || !result.brief || !result.signals) return result;
  const proofMs = o.proofTimeoutMs ?? PROOF_TIMEOUT_MS;
  const emit = o.onEvent;
  emit?.({ type: "stage", stage: "proof", status: "start" });
  try {
    const picks = await withDeadline(baseline, proofMs);
    const proof =
      picks.length === 0
        ? undefined
        : await withDeadline(
            scoreProof({
              qloo: o.qloo,
              signals: result.signals,
              baseline: picks,
              tasteforge: tasteforgePicks(result.brief, result.ledger),
              city: result.city,
            }),
            proofMs,
          );
    if (!proof) {
      emit?.({ type: "stage", stage: "proof", status: "done", detail: "unavailable" });
      return result;
    }
    emit?.({ type: "stage", stage: "proof", status: "done", detail: `${proof.baselineAvg ?? "n/a"} vs ${proof.tasteforgeAvg ?? "n/a"}` });
    emit?.({ type: "proof", proof });
    return { ...result, proof };
  } catch (e) {
    logWarn("taste proof unavailable", e);
    emit?.({ type: "stage", stage: "proof", status: "done", detail: "unavailable" });
    return result;
  }
}

/**
 * The full request: pipeline, then Taste Proof in the same stream. The plain-LLM baseline starts
 * as soon as the seeds are resolved, so the proof only waits on scoring. A proof failure never fails the brief.
 */
export async function generateBrief(o: GenerateOptions): Promise<GenerateResult> {
  let baseline: Promise<PickRef[]> | undefined;
  // Only once the seeds resolved: a run that stops to ask the user a question must not spend a baseline LLM call.
  const onResolved = (): void => {
    if (o.withProof !== false) baseline ??= beginBaseline(o);
    o.onResolved?.();
  };
  const result = await runPipeline({ ...o, onResolved });
  return baseline ? finishProof(o, baseline, result) : result;
}
