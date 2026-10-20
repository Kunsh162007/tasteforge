import { MAX_REFINE_BODY_CHARS, parseRefineRequest, PIPELINE_TIMEOUT_MS, refineBrief } from "@/lib/agent";
import { handleStreamRoute } from "@/lib/http/streamRoute";
import { verifyRefineRequest } from "@/lib/security/verifyRequest";

export const maxDuration = 120;

/** Refine loop: regenerates only the sections with disliked items, keeping liked and locked ones. */
export async function POST(req: Request): Promise<Response> {
  return handleStreamRoute(req, {
    tooManyMessage: "Too many requests. Please wait a few minutes and try again.",
    maxBodyBytes: MAX_REFINE_BODY_CHARS,
    bodyLimitLabel: "200 KB",
    parse: parseRefineRequest,
    verify: verifyRefineRequest,
    run: async (request, deps, emit) => (await refineBrief({ request, ...deps, onEvent: emit, timeoutMs: PIPELINE_TIMEOUT_MS })).ok,
  });
}
