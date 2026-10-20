export type RateLimiter = {
  check(key: string): { allowed: boolean; retryAfterSeconds: number };
};

export type RateLimiterOptions = {
  readonly limit: number;
  readonly windowMs: number;
  readonly now?: () => number;
};

const MAX_KEYS = 5_000;

/** In-memory sliding-window limiter. Per server instance only; adequate for a hackathon demo. */
export function createRateLimiter(o: RateLimiterOptions): RateLimiter {
  const now = o.now ?? Date.now;
  const hits = new Map<string, number[]>();

  function prune(t: number): void {
    for (const [key, stamps] of hits) {
      if (stamps.every((s) => t - s >= o.windowMs)) hits.delete(key);
    }
  }

  return {
    check(key) {
      const t = now();
      if (hits.size > MAX_KEYS) prune(t);
      const recent = (hits.get(key) ?? []).filter((s) => t - s < o.windowMs);
      if (recent.length >= o.limit) {
        hits.set(key, recent);
        return { allowed: false, retryAfterSeconds: Math.ceil((recent[0] + o.windowMs - t) / 1000) };
      }
      hits.set(key, [...recent, t]);
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
