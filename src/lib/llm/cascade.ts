import { nextUtcMidnight } from "./ratelimit";
import { LlmError, type JsonRequest, type LlmProvider } from "./types";

export type CascadeEntry = {
  /** "provider:model", shown in brief metadata. */
  readonly id: string;
  readonly provider: LlmProvider;
};

export type CascadeOptions = {
  readonly now?: () => number;
  /** Called when a model fails and the next one is tried. */
  readonly onSwitch?: (from: string, to: string, error: LlmError) => void;
  /** Called once per upstream request actually sent (feeds the daily budget). */
  readonly onCall?: () => void;
  /** Cooldowns shared with other cascades, so a model cooling in one chain is skipped in the others too. */
  readonly cooldowns?: Map<string, number>;
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

/**
 * Tries models in order. A model that hits a quota, outage or auth problem cools down (daily quotas until
 * UTC midnight, others for the server's retry-after) and is skipped until then, so one exhausted free tier
 * never costs a failed request per brief.
 */
export function createCascade(entries: readonly CascadeEntry[], o: CascadeOptions = {}): LlmProvider {
  if (entries.length === 0) throw new Error("The LLM chain is empty.");
  const now = o.now ?? Date.now;
  const coolUntil = o.cooldowns ?? new Map<string, number>();
  let answered: string | undefined;
  const cooling = (e: CascadeEntry): boolean => (coolUntil.get(e.id) ?? 0) > now();
  const available = (): CascadeEntry[] => entries.filter((e) => !cooling(e));

  async function run(req: JsonRequest): Promise<unknown> {
    const candidates = available();
    if (candidates.length === 0) throw allCooling();
    let last: LlmError | undefined;
    for (const [i, entry] of candidates.entries()) {
      o.onCall?.();
      try {
        const value = await entry.provider.chatJson(req);
        answered = entry.id;
        return value;
      } catch (e) {
        if (!(e instanceof LlmError)) throw e;
        last = e;
        const until = cooldownUntil(e, now());
        if (until !== undefined) coolUntil.set(entry.id, until);
        const next = candidates[i + 1];
        if (next) o.onSwitch?.(entry.id, next.id, e);
      }
    }
    throw last as LlmError;
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
