import { nextUtcMidnight } from "./ratelimit";
import type { TokenBudget } from "./tokenBudget";
import { LlmError, REPLY_TOKEN_CAP, type JsonRequest, type LlmProvider } from "./types";

export type CascadeEntry = {
  /** "provider:model", shown in brief metadata. */
  readonly id: string;
  readonly provider: LlmProvider;
};

export type CascadeOptions = {
  readonly now?: () => number;
  /** Called when a model fails and the next one is tried. */
  readonly onSwitch?: (from: string, to: string, error: LlmError) => void;
  /** Called once per upstream request actually sent. */
  readonly onCall?: () => void;
  /** Cooldowns shared with other cascades, so a model cooling in one chain is skipped in the others too. */
  readonly cooldowns?: Map<string, number>;
  /** Per-minute token budget shared by all cascades: a model without room for the request is passed over. */
  readonly budget?: TokenBudget;
  /** Waits (injectable for tests). */
  readonly sleep?: (ms: number) => Promise<void>;
  /** The longest a request may wait for capacity before the cascade stops queueing and fails or tries anyway. */
  readonly maxQueueMs?: number;
};

const MIN_RATE_LIMIT_COOL_MS = 5_000;
const DEFAULT_RATE_LIMIT_COOL_MS = 60_000;
const MAX_MINUTE_COOL_MS = 60 * 60_000;
const SERVER_COOL_MS = 30_000;
const NETWORK_COOL_MS = 15_000;
const BROKEN_MODEL_COOL_MS = 60 * 60_000;

/**
 * When a failed model may be tried again, or undefined when the failure was about this one request
 * (unparsable reply, oversized prompt) and the model itself is fine.
 */
export function cooldownUntil(error: LlmError, now: number): number | undefined {
  switch (error.kind) {
    case "rate_limit": {
      if (error.quota === "day") return nextUtcMidnight(now);
      const wait = error.retryAfterMs ?? DEFAULT_RATE_LIMIT_COOL_MS;
      return now + Math.min(Math.max(wait, MIN_RATE_LIMIT_COOL_MS), MAX_MINUTE_COOL_MS);
    }
    case "server":
      return now + (error.retryAfterMs ?? SERVER_COOL_MS);
    case "network":
    case "timeout":
      return now + NETWORK_COOL_MS;
    case "auth":
      return now + BROKEN_MODEL_COOL_MS;
    case "bad_request":
      return error.status === 404 ? now + BROKEN_MODEL_COOL_MS : undefined;
    default:
      return undefined;
  }
}

const CHARS_PER_TOKEN = 3.3;
/** Budget reserved for the reply before the real count is known: the most the request allows (REPLY_TOKEN_CAP). */
const EXPECTED_REPLY_TOKENS = REPLY_TOKEN_CAP;
const DEFAULT_MAX_QUEUE_MS = 25_000;
/** A queued request must still leave this much of the caller's deadline for the model to answer. */
const MIN_WORK_AFTER_QUEUE_MS = 12_000;
const MAX_QUEUE_ROUNDS = 2;

/** Rough token cost of a request: prompt and schema by characters, plus a typical reply for its route. */
export function estimateTokens(req: JsonRequest): number {
  const chars = req.system.length + req.prompt.length + (req.schema ? JSON.stringify(req.schema).length : 0);
  const route = req.route ?? (req.tier === "light" ? "fast" : "main");
  return Math.ceil(chars / CHARS_PER_TOKEN) + EXPECTED_REPLY_TOKENS[route];
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Tries models in order. A model that hits a quota, outage or auth problem cools down (daily quotas until
 * UTC midnight, others for the server's retry-after) and is skipped until then, so one exhausted free tier
 * never costs a failed request per brief.
 *
 * With a token budget, a model whose per-minute tokens cannot take the request is passed over before it is
 * called (the next model with room answers). When no model can take it, the request queues for the shortest
 * wait, up to maxQueueMs, and tells the caller through onWait so the user sees "high demand" rather than silence.
 */
export function createCascade(entries: readonly CascadeEntry[], o: CascadeOptions = {}): LlmProvider {
  if (entries.length === 0) throw new Error("The LLM chain is empty.");
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? defaultSleep;
  const maxQueueMs = o.maxQueueMs ?? DEFAULT_MAX_QUEUE_MS;
  const coolUntil = o.cooldowns ?? new Map<string, number>();
  let answered: string | undefined;
  const cooling = (e: CascadeEntry): boolean => (coolUntil.get(e.id) ?? 0) > now();
  const available = (): CascadeEntry[] => entries.filter((e) => !cooling(e));
  const fits = (e: CascadeEntry, need: number): boolean => o.budget?.fits(e.id, need) ?? true;

  /** How long until some model could take the request, or undefined when nothing is worth waiting for. */
  function shortestWait(need: number): number | undefined {
    const waits = entries.map((e) => Math.max(Math.max((coolUntil.get(e.id) ?? 0) - now(), 0), o.budget?.waitFor(e.id, need) ?? 0));
    const soonest = Math.min(...waits);
    return Number.isFinite(soonest) ? soonest : undefined;
  }

  function worthQueueing(wait: number | undefined, req: JsonRequest): wait is number {
    if (wait === undefined || wait > maxQueueMs) return false;
    return req.deadlineAt === undefined || req.deadlineAt - now() - wait >= MIN_WORK_AFTER_QUEUE_MS;
  }

  async function queue(wait: number, req: JsonRequest): Promise<void> {
    req.onWait?.({ waitMs: wait });
    await sleep(wait + 50);
  }

  async function attempt(candidates: readonly CascadeEntry[], req: JsonRequest, need: number): Promise<{ value?: unknown; last?: LlmError }> {
    let last: LlmError | undefined;
    for (const [i, entry] of candidates.entries()) {
      o.onCall?.();
      const hold = o.budget?.reserve(entry.id, need);
      try {
        const value = await entry.provider.chatJson(req);
        hold?.settle();
        answered = entry.id;
        req.onAnswered?.(entry.id);
        return { value };
      } catch (e) {
        hold?.settle(0);
        if (!(e instanceof LlmError)) throw e;
        last = e;
        const until = cooldownUntil(e, now());
        if (until !== undefined) coolUntil.set(entry.id, until);
        const next = candidates[i + 1];
        if (next) o.onSwitch?.(entry.id, next.id, e);
      }
    }
    return { last };
  }

  async function run(req: JsonRequest): Promise<unknown> {
    const need = estimateTokens(req);
    for (let round = 0; ; round += 1) {
      const open = available();
      const roomy = open.filter((e) => fits(e, need));
      if (roomy.length === 0) {
        // Nothing can take the request now: queue for the shortest wait, else try what is left in chain order.
        const wait = shortestWait(need);
        if (round < MAX_QUEUE_ROUNDS && worthQueueing(wait, req) && wait > 0) {
          await queue(wait, req);
          continue;
        }
        if (open.length === 0) throw allCooling();
      }
      // Models with room first (chain order), then the rest as a last resort.
      const { value, last } = await attempt([...roomy, ...open.filter((e) => !roomy.includes(e))], req, need);
      if (last === undefined) return value;
      const wait = shortestWait(need);
      if (last.kind === "rate_limit" && round < MAX_QUEUE_ROUNDS && worthQueueing(wait, req) && wait > 0) {
        await queue(wait, req);
        continue;
      }
      throw last;
    }
  }

  function allCooling(): LlmError {
    const soonest = Math.min(...entries.map((e) => coolUntil.get(e.id) ?? 0));
    return new LlmError("llm", "rate_limit", "Every configured language model is cooling down after a quota or outage.", 429, {
      retryAfterMs: Math.max(soonest - now(), 0),
    });
  }

  return {
    get name() {
      return answered ?? available()[0]?.id ?? entries[0].id;
    },
    chatJson: run,
  };
}
