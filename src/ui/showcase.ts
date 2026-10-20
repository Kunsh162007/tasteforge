import type { LedgerSignatures } from "@/lib/agent";
import type { ShowcaseEntry } from "@/lib/showcase";
import { INITIAL_RUN, reduceEvent, type RunState } from "./runState";

/** A showcase entry as the API serves it: ready entries carry the server's signatures. */
export type ShowcaseItem = ShowcaseEntry & { signatures?: LedgerSignatures };

export const POLL_BASE_MS = 1_500;
export const POLL_MAX_MS = 8_000;
export const POLL_BUDGET_MS = 60_000;

/** Delay before poll number `attempt` (0-based): 1.5s, 2.25s, 3.4s ... capped at 8s. */
export const pollDelay = (attempt: number): number => Math.min(POLL_MAX_MS, Math.round(POLL_BASE_MS * 1.5 ** attempt));

/** A failed brief the server will retry on its own (backoff running, attempts left). */
const retryPending = (i: ShowcaseItem): boolean => i.status === "failed" && i.nextRetryAt !== undefined;

/** True once nothing is queued, being built or waiting for an automatic retry. */
export const isSettled = (items: readonly ShowcaseItem[]): boolean =>
  items.every((i) => i.status === "ready" || (i.status === "failed" && !retryPending(i)));

/** Seconds until the next automatic retry of a failed brief (0 when due or not scheduled). */
export function retryInSeconds(item: ShowcaseItem, now: number): number {
  return item.nextRetryAt === undefined ? 0 : Math.max(0, Math.ceil((item.nextRetryAt - now) / 1000));
}

/** Replays a ready showcase entry as a finished run, so the normal brief view renders it. */
export function showcaseToRunState(item: ShowcaseItem): RunState | null {
  if (item.status !== "ready" || !item.brief) return null;
  const replayed = (item.trail ?? []).reduce(reduceEvent, {
    ...INITIAL_RUN,
    request: { prompt: item.prompt, mode: item.mode, ...(item.city ? { city: item.city } : {}) },
  });
  const withBrief = reduceEvent(replayed, {
    type: "brief",
    brief: item.brief,
    dropped: item.dropped ?? [],
    evidence: item.evidence ?? [],
    ...(item.signals ? { signals: item.signals } : {}),
    ...(item.signatures ? { signatures: item.signatures } : {}),
  });
  return item.proof ? reduceEvent(withBrief, { type: "proof", proof: item.proof }) : withBrief;
}

/** One poll. Returns null on network or HTTP failure so callers can show a calm fallback. */
export async function fetchShowcase(signal?: AbortSignal, retryFailed = false): Promise<ShowcaseItem[] | null> {
  try {
    const res = await fetch(retryFailed ? "/api/showcase?retry=1" : "/api/showcase", { signal, cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { items?: ShowcaseItem[] };
    return Array.isArray(json.items) ? json.items : null;
  } catch {
    return null;
  }
}
