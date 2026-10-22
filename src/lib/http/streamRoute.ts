import type { AgentEvent } from "@/lib/agent";
import { getLedgerSigner, type LedgerSigner } from "@/lib/security/ledgerSig";
import { getBudget, type Budget } from "./budget";
import { getRouteDeps, type RouteDeps } from "./deps";
import { getPipelineLimiter } from "./guards";
import { BodyTooLargeError, clientIp, readJsonBody } from "./request";
import { jsonError, SSE_HEADERS, sseStream } from "./sse";
import type { RateLimiter } from "@/lib/rateLimit";
import { monthReserve, quotaPauseMessage } from "@/lib/qloo/quota";

/**
 * The scaffolding every streaming brief route shares: rate limit, body limit, parse, signature check,
 * dependencies, capacity budget, then the SSE stream. A route only says how to parse and what to run.
 */

export type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

export type StreamRouteSpec<T> = {
  /** Shown to the visitor when they are rate limited. */
  readonly tooManyMessage: string;
  readonly maxBodyBytes: number;
  /** Human size for the limit, e.g. "4 KB". */
  readonly bodyLimitLabel: string;
  readonly parse: (body: unknown) => Parsed<T>;
  /** Returns a message when signed data came back altered. */
  readonly verify?: (value: T, signer: LedgerSigner) => string | undefined;
  readonly run: (value: T, deps: RouteDeps, emit: (event: AgentEvent) => void) => Promise<boolean>;
};

/** Injection points for tests; production uses the process-wide singletons. */
export type StreamRouteEnv = {
  readonly limiter?: RateLimiter;
  readonly budget?: Budget;
  readonly signer?: LedgerSigner;
  readonly deps?: () => RouteDeps;
  /** Returns the pause message when the shared Qloo month quota is nearly spent. */
  readonly quotaPause?: () => string | undefined;
};

const NOT_CONFIGURED = "The server is not configured for briefs yet.";

/** Adds the server's signatures to every brief event so the browser can echo them back later. */
function signing(emit: (event: AgentEvent) => void, signer: LedgerSigner): (event: AgentEvent) => void {
  return (event) => emit(event.type === "brief" ? { ...event, signatures: signer.sign({ evidence: event.evidence, signals: event.signals }) } : event);
}

async function readBody(req: Request, spec: { maxBodyBytes: number; bodyLimitLabel: string }): Promise<{ body: unknown } | Response> {
  try {
    return { body: await readJsonBody(req, spec.maxBodyBytes) };
  } catch (e) {
    if (e instanceof BodyTooLargeError) return jsonError(`Request body must be under ${spec.bodyLimitLabel}.`, 413);
    return jsonError(`Request body must be valid JSON under ${spec.bodyLimitLabel}.`, 400);
  }
}

/** A friendly stop in the stream the UI already understands: one non-retryable error, then done. */
function quotaPausedResponse(message: string): Response {
  const stream = sseStream(async (emit) => {
    emit({ type: "error", message, retryable: false });
    return false;
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

export async function handleStreamRoute<T>(req: Request, spec: StreamRouteSpec<T>, env: StreamRouteEnv = {}): Promise<Response> {
  const limit = (env.limiter ?? getPipelineLimiter()).check(clientIp(req));
  if (!limit.allowed) return jsonError(spec.tooManyMessage, 429, { "Retry-After": String(limit.retryAfterSeconds) });

  const read = await readBody(req, spec);
  if (read instanceof Response) return read;
  const parsed = spec.parse(read.body);
  if (!parsed.ok) return jsonError(parsed.message, 400);
  const signer = env.signer ?? getLedgerSigner();
  const tampered = spec.verify?.(parsed.value, signer);
  if (tampered) return jsonError(tampered, 400);

  const paused = (env.quotaPause ?? (() => quotaPauseMessage(monthReserve())))();
  if (paused) return quotaPausedResponse(paused);

  let deps: RouteDeps;
  try {
    deps = (env.deps ?? getRouteDeps)();
  } catch {
    return jsonError(NOT_CONFIGURED, 503);
  }
  const admission = (env.budget ?? getBudget()).admit();
  if (!admission.ok) return jsonError(admission.message, 503, { "Retry-After": String(admission.retryAfterSeconds) });

  const stream = sseStream(async (emit) => {
    try {
      return await spec.run(parsed.value, deps, signing(emit, signer));
    } finally {
      admission.release();
    }
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
