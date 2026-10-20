import { createRateLimiter, type RateLimiter } from "@/lib/rateLimit";
import { singleton } from "@/lib/singleton";

/**
 * Process-wide rate limiters. Brief, refine and compare draw on the same per-visitor allowance, so asking
 * for one more refinement is not a way around the brief limit. Everything is in-memory, per server instance.
 */

const WINDOW_MS = 10 * 60 * 1000;
/** Brief, refine and compare requests one visitor may start per window, all routes together. */
export const PIPELINE_RATE_LIMIT = 12;
/** Manual showcase retries one visitor may trigger per window. */
export const SHOWCASE_RETRY_PER_VISITOR = 3;
const SHOWCASE_RETRY_GLOBAL_WINDOW_MS = 60 * 1000;
/** Signature checks are cheap, so the allowance is generous. */
export const VERIFY_RATE_LIMIT = 60;

export const getPipelineLimiter = (): RateLimiter =>
  singleton("pipelineLimiter", () => createRateLimiter({ limit: PIPELINE_RATE_LIMIT, windowMs: WINDOW_MS }));

export const getVerifyLimiter = (): RateLimiter =>
  singleton("verifyLimiter", () => createRateLimiter({ limit: VERIFY_RATE_LIMIT, windowMs: WINDOW_MS }));

/**
 * `?retry=1` on the showcase restarts failed generations (LLM spend). It is allowed a few times per visitor
 * and at most once a minute for the whole server.
 */
export function allowShowcaseRetry(ip: string): boolean {
  const perVisitor = singleton("showcaseRetryVisitor", () => createRateLimiter({ limit: SHOWCASE_RETRY_PER_VISITOR, windowMs: WINDOW_MS }));
  const everyone = singleton("showcaseRetryGlobal", () => createRateLimiter({ limit: 1, windowMs: SHOWCASE_RETRY_GLOBAL_WINDOW_MS }));
  return perVisitor.check(ip).allowed && everyone.check("all").allowed;
}
