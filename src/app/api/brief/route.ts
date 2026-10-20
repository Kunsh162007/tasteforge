import { generateBrief, parseBriefRequest, PIPELINE_TIMEOUT_MS } from "@/lib/agent";
import { handleStreamRoute } from "@/lib/http/streamRoute";

// Runs on the default Node.js runtime (route segment `runtime`/`dynamic` are unsupported with cacheComponents).
export const maxDuration = 120;

const MAX_BODY_BYTES = 4_000;

export async function POST(req: Request): Promise<Response> {
  return handleStreamRoute(req, {
    tooManyMessage: "Too many briefs requested. Please wait a few minutes and try again.",
    maxBodyBytes: MAX_BODY_BYTES,
    bodyLimitLabel: "4 KB",
    parse: parseBriefRequest,
    run: async (request, deps, emit) => (await generateBrief({ ...request, ...deps, onEvent: emit, timeoutMs: PIPELINE_TIMEOUT_MS })).ok,
  });
}
