import { singleton } from "@/lib/singleton";

/**
 * Latest Qloo rate-limit headers, kept per server process. verified live 2026-10-21: every response carries
 * X-Second-RateLimit-{Limit,Remaining,Reset} (10 a second, reset in seconds) and X-Month-RateLimit-{Limit,Remaining,Reset}
 * (50,000 a month, reset in seconds).
 */

export type RateWindow = {
  readonly limit?: number;
  readonly remaining: number;
  /** Epoch ms at which the window resets, from the observation time plus the Reset header. */
  readonly resetsAt?: number;
  /** Epoch ms of the response that carried these numbers. */
  readonly observedAt: number;
};

export type QuotaState = { readonly month?: RateWindow; readonly second?: RateWindow };

/** Below this many requests left in the current second, a hedged duplicate is not worth the burst. */
export const HEDGE_MIN_SECOND_REMAINING = 3;
/** A reset header larger than this is not a per-second window; do not stall for it. */
const MAX_SECOND_WAIT_MS = 5_000;

const store = (): { state: QuotaState } => singleton("qlooQuota", () => ({ state: {} as QuotaState }));

export const getQuota = (): QuotaState => store().state;

/** Forgets what was observed (tests only). */
export function resetQuota(): void {
  store().state = {};
}

function num(headers: Headers, name: string): number | undefined {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function readWindow(headers: Headers, prefix: string, now: number): RateWindow | undefined {
  const remaining = num(headers, `${prefix}-remaining`);
  if (remaining === undefined) return undefined;
  const limit = num(headers, `${prefix}-limit`);
  const reset = num(headers, `${prefix}-reset`);
  return {
    ...(limit !== undefined ? { limit } : {}),
    remaining,
    ...(reset !== undefined ? { resetsAt: now + reset * 1000 } : {}),
    observedAt: now,
  };
}

/** Replaces the stored state with a new object when the response carried rate-limit headers. */
export function recordRateLimitHeaders(headers: Headers, now: number = Date.now()): void {
  const month = readWindow(headers, "x-month-ratelimit", now);
  const second = readWindow(headers, "x-second-ratelimit", now);
  if (!month && !second) return;
  const s = store();
  s.state = { ...s.state, ...(month ? { month } : {}), ...(second ? { second } : {}) };
}

/** How long to wait before the next request when this second's allowance is spent (0 when free to go). */
export function secondWaitMs(now: number = Date.now()): number {
  const second = getQuota().second;
  if (!second || second.remaining > 0 || second.resetsAt === undefined) return 0;
  return Math.min(MAX_SECOND_WAIT_MS, Math.max(0, second.resetsAt - now));
}

/** True when a duplicate request would eat into a nearly spent per-second allowance. */
export function secondAllowanceLow(now: number = Date.now()): boolean {
  const second = getQuota().second;
  if (!second || second.remaining >= HEDGE_MIN_SECOND_REMAINING) return false;
  return second.resetsAt === undefined || second.resetsAt > now;
}

/** What /api/health shows: numbers only. */
export type QuotaSummary = {
  readonly monthRemaining: number | null;
  readonly monthLimit: number | null;
  readonly monthResetsAt: string | null;
};

export function quotaSummary(): QuotaSummary {
  const month = getQuota().month;
  return {
    monthRemaining: month?.remaining ?? null,
    monthLimit: month?.limit ?? null,
    monthResetsAt: month?.resetsAt !== undefined ? new Date(month.resetsAt).toISOString() : null,
  };
}

/** One printable line for `npm run qloo:check`; numbers only. */
export function formatQuotaLine(now: number = Date.now()): string {
  const { month, second } = getQuota();
  if (!month && !second) return "QUOTA: no rate-limit headers seen (mock mode or no response).";
  const parts: string[] = [];
  if (month) {
    const days = month.resetsAt !== undefined ? `, resets in ${((month.resetsAt - now) / 86_400_000).toFixed(1)} days` : "";
    parts.push(`month ${month.remaining}/${month.limit ?? "?"} left${days}`);
  }
  if (second) parts.push(`second ${second.remaining}/${second.limit ?? "?"} left`);
  return `QUOTA: ${parts.join("; ")}.`;
}
