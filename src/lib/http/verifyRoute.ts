import { z } from "zod";
import { EvidenceSchema } from "@/lib/agent/refine/request";
import { getLedgerSigner, type LedgerSigner } from "@/lib/security/ledgerSig";
import type { RateLimiter } from "@/lib/rateLimit";
import { getVerifyLimiter } from "./guards";
import { BodyTooLargeError, clientIp, readJsonBody } from "./request";
import { jsonError } from "./sse";

/** POST /api/verify: is the evidence on a shared link what this server issued? */

const MAX_VERIFY_BODY_BYTES = 200_000;
const MAX_RECORDS = 120;
const MAX_SIG_CHARS = 64;

const VerifySchema = z.object({
  evidence: z.array(EvidenceSchema).max(MAX_RECORDS),
  signatures: z.record(z.string().max(16), z.string().max(MAX_SIG_CHARS)),
});

export type VerifyEnv = { readonly limiter?: RateLimiter; readonly signer?: LedgerSigner };

export async function handleVerify(req: Request, env: VerifyEnv = {}): Promise<Response> {
  const limit = (env.limiter ?? getVerifyLimiter()).check(clientIp(req));
  if (!limit.allowed) return jsonError("Too many checks. Please wait a moment.", 429, { "Retry-After": String(limit.retryAfterSeconds) });
  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_VERIFY_BODY_BYTES);
  } catch (e) {
    return e instanceof BodyTooLargeError ? jsonError("Request body is too large.", 413) : jsonError("Request body must be valid JSON.", 400);
  }
  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid verify request.", 400);
  const { evidence, signatures } = parsed.data;
  // A link with no evidence has nothing to vouch for.
  const verified = evidence.length > 0 && (env.signer ?? getLedgerSigner()).verifyShared(evidence, signatures);
  return Response.json({ verified }, { headers: { "Cache-Control": "no-store" } });
}
