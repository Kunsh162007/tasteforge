/** Rate-limit hints pulled from a 429 reply. Only derived numbers leave this module, never the body. */

export type RateLimitInfo = {
  readonly retryAfterMs?: number;
  /** "day" when a per-day quota is exhausted (the model stays unusable until the quota resets). */
  readonly quota: "day" | "minute";
};

const DAILY = /PerDay|per day|\bTPD\b|\bRPD\b|daily/i;
const GEMINI_DELAY = /"retryDelay"\s*:\s*"([\d.]+)s"/;
const TRY_AGAIN = /try again in\s+(?:(\d+(?:\.\d+)?)h)?\s*(?:(\d+(?:\.\d+)?)m(?!s))?\s*(?:(\d+(?:\.\d+)?)s)?\s*(?:(\d+(?:\.\d+)?)ms)?/i;

function fromHeader(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function fromBody(body: string): number | undefined {
  const gemini = GEMINI_DELAY.exec(body);
  if (gemini) return Math.round(Number(gemini[1]) * 1000);
  const m = TRY_AGAIN.exec(body);
  if (!m || (!m[1] && !m[2] && !m[3] && !m[4])) return undefined;
  const [h, min, s, ms] = [m[1], m[2], m[3], m[4]].map((v) => (v ? Number(v) : 0));
  return Math.round(h * 3_600_000 + min * 60_000 + s * 1000 + ms);
}

export function parseRateLimit(retryAfterHeader: string | undefined, body: string): RateLimitInfo {
  const retryAfterMs = fromHeader(retryAfterHeader) ?? fromBody(body);
  const quota = DAILY.test(body) ? "day" : "minute";
  return retryAfterMs === undefined ? { quota } : { retryAfterMs, quota };
}

/** The next 00:00 UTC strictly after `now` (free-tier daily quotas reset then). */
export function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}
