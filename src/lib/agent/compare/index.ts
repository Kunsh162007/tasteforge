import type { ReverseGeocoder } from "@/lib/geo/nominatim";
import type { LlmProvider } from "@/lib/llm";
import type { QlooClient } from "@/lib/qloo";
import type { AgentEvent } from "../events";
import { runPipeline, type PipelineResult } from "../pipeline";
import type { CompareRequest } from "./request";

export { MAX_COMPARE_BODY_CHARS, parseCompareRequest, type CompareRequest } from "./request";

export type CompareOptions = {
  readonly request: CompareRequest;
  readonly llm: LlmProvider;
  readonly qloo: QlooClient;
  readonly onEvent?: (event: AgentEvent) => void;
  readonly timeoutMs?: number;
  readonly geocode?: ReverseGeocoder;
};

/**
 * Second-city run for the side-by-side view. Same prompt, same resolved seeds: extraction and
 * resolution are skipped, so the usual cost is one LLM call (synthesis). No Taste Proof run.
 * Without signals (older showcase briefs) it derives them like a normal run, never asking questions.
 */
export function compareBrief(o: CompareOptions): Promise<PipelineResult> {
  const { prompt, mode, city, signals } = o.request;
  return runPipeline({
    prompt,
    mode,
    city,
    llm: o.llm,
    qloo: o.qloo,
    onEvent: o.onEvent,
    timeoutMs: o.timeoutMs,
    geocode: o.geocode,
    allowNeedsInput: false,
    ...(signals && (signals.entityIds.length > 0 || signals.tagIds.length > 0) ? { presetSignals: signals } : {}),
  });
}
