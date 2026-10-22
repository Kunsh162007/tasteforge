import { singleton } from "@/lib/singleton";

/**
 * Latest Qloo rate-limit headers, kept per server process. verified live 2026-10-21: every response carries
 * X-Second-RateLimit-{Limit,Remaining,Reset} (10 a second, reset in seconds) and X-Month-RateLimit-{Limit,Remaining,Reset}
 * (50,000 a month, reset in seconds). The key is shared with the judges, so live runs pause before the month runs dry.
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

type Env = Readonly<Record<string, string | undefined>>;

export const DEFAULT_MONTH_RESERVE = 2000;
export const DEFAULT_SHOWCASE_RESERVE = 1000;
/** Below this many requests left in the current second, a hedged duplicate is not worth the burst. */
export const HEDGE_MIN_SECOND_REMAINING = 3;
/** A reset header larger than this is not a per-second window; do not stall for it. */
const MAX_SECOND_WAIT_MS = 5_000;

export const QUOTA_PAUSED_MESSAGE =
  "Live briefs are paused to protect the shared data quota. The finished briefs on the home page still work.";

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

function reserveFrom(raw: string | undefined, fallback: number): number {
  const n = raw === undefined || raw.trim() === "" ? Number.NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Month-remaining under which new live runs are refused (env QLOO_MONTH_RESERVE, default 2000). */
export const monthReserve = (env: Env = process.env): number => reserveFrom(env.QLOO_MONTH_RESERVE, DEFAULT_MONTH_RESERVE);

/** Showcase generation may dig deeper into the quota, but never above the main reserve. */
export const showcaseReserve = (env: Env = process.env): number => Math.min(DEFAULT_SHOWCASE_RESERVE, monthReserve(env));

/** The friendly refusal when month-remaining is known and below `reserve`; undefined when runs may go ahead. */
export function quotaPauseMessage(reserve: number): string | undefined {
  const month = getQuota().month;
  return month && month.remaining < reserve ? QUOTA_PAUSED_MESSAGE : undefined;
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
  readonly paused: boolean;
};

export function quotaSummary(env: Env = process.env): QuotaSummary {
  const month = getQuota().month;
  return {
    monthRemaining: month?.remaining ?? null,
    monthLimit: month?.limit ?? null,
    monthResetsAt: month?.resetsAt !== undefined ? new Date(month.resetsAt).toISOString() : null,
    paused: quotaPauseMessage(monthReserve(env)) !== undefined,
  };
}

/** One printable line for `npm run qloo:check`; numbers only. */
export function formatQuotaLine(env: Env = process.env, now: number = Date.now()): string {
  const { month, second } = getQuota();
  if (!month && !second) return "QUOTA: no rate-limit headers seen (mock mode or no response).";
  const parts: string[] = [];
  if (month) {
    const days = month.resetsAt !== undefined ? `, resets in ${((month.resetsAt - now) / 86_400_000).toFixed(1)} days` : "";
    parts.push(`month ${month.remaining}/${month.limit ?? "?"} left${days}`);
  }
  if (second) parts.push(`second ${second.remaining}/${second.limit ?? "?"} left`);
  const paused = quotaPauseMessage(monthReserve(env)) !== undefined;
  return `QUOTA: ${parts.join("; ")}; live briefs ${paused ? "PAUSED (below QLOO_MONTH_RESERVE)" : "allowed"}.`;
}
