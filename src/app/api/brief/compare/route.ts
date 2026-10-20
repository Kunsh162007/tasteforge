import { compareBrief, MAX_COMPARE_BODY_CHARS, parseCompareRequest, PIPELINE_TIMEOUT_MS } from "@/lib/agent";
import { handleStreamRoute } from "@/lib/http/streamRoute";
import { verifyCompareRequest } from "@/lib/security/verifyRequest";

export const maxDuration = 120;

/** Two-city comparison: reruns the brief for a second city, reusing the first run's resolved seeds. */
export async function POST(req: Request): Promise<Response> {
  return handleStreamRoute(req, {
    tooManyMessage: "Too many requests. Please wait a few minutes and try again.",
    maxBodyBytes: MAX_COMPARE_BODY_CHARS,
    bodyLimitLabel: "6 KB",
    parse: parseCompareRequest,
    verify: verifyCompareRequest,
    run: async (request, deps, emit) => (await compareBrief({ request, ...deps, onEvent: emit, timeoutMs: PIPELINE_TIMEOUT_MS })).ok,
  });
}
