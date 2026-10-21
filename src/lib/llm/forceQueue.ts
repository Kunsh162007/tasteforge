import { routeOf } from "./route";
import type { LlmProvider } from "./types";

/**
 * A development and test switch that puts the model cascade into "every fast model is cooling down", so the "High demand"
 * state can be seen and tested without exhausting a real quota. `LLM_FORCE_QUEUE_SECONDS=8` makes the first short call (seeds)
 * of each minute wait that long and report it through `onWait`, exactly as a real queue does. In production it is ignored
 * unless `LLM_ALLOW_FORCED_QUEUE=1` is set as well.
 */

type Env = Readonly<Record<string, string | undefined>>;

/** Longest forced wait: the cascade itself queues at most 25 s, and a run must still fit its deadline. */
export const MAX_FORCED_QUEUE_SECONDS = 20;
/** The forced wait applies once per this long, so one brief (seeds, critic, baseline) waits once, not three times. */
export const FORCED_QUEUE_INTERVAL_MS = 60_000;

export function forcedQueueSeconds(env: Env = process.env): number | undefined {
  const n = Number(env.LLM_FORCE_QUEUE_SECONDS);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (env.NODE_ENV === "production" && env.LLM_ALLOW_FORCED_QUEUE !== "1") return undefined;
  return Math.min(n, MAX_FORCED_QUEUE_SECONDS);
}

/** Returns true when a forced wait is due: none has started in the last interval. */
export function createForcedQueueGate(now: () => number = Date.now): () => boolean {
  let last = -Infinity;
  return () => {
    const t = now();
    if (t - last < FORCED_QUEUE_INTERVAL_MS) return false;
    last = t;
    return true;
  };
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** For the scripted provider, which has no cascade: wait and report the wait the way the cascade would. */
export function withSimulatedQueue(
  inner: LlmProvider,
  seconds: number,
  o: { readonly sleep?: (ms: number) => Promise<void>; readonly now?: () => number } = {},
): LlmProvider {
  const due = createForcedQueueGate(o.now);
  const sleep = o.sleep ?? defaultSleep;
  return {
    get name() {
      return inner.name;
    },
    async chatJson(req) {
      if (routeOf(req) === "fast" && due()) {
        req.onWait?.({ waitMs: seconds * 1000 });
        await sleep(seconds * 1000);
      }
      return inner.chatJson(req);
    },
  };
}
