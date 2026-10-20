export type CacheOptions = {
  readonly maxEntries: number;
  readonly ttlMs: number;
  readonly now?: () => number;
};

export type Cache<T> = {
  get(key: string): T | undefined;
  /** `ttlMs` overrides the default lifetime for this entry (stable lookups such as name searches live longer). */
  set(key: string, value: T, ttlMs?: number): void;
  size(): number;
  clear(): void;
};

type Entry<T> = { readonly value: T; readonly expiresAt: number };

/**
 * Small in-memory LRU with TTL. Values are cloned on the way in and out so
 * callers can never mutate cached data. Server-side only; never persisted
 * to the repo (Qloo terms).
 */
export function createCache<T>(options: CacheOptions): Cache<T> {
  const { maxEntries, ttlMs, now = Date.now } = options;
  if (!(maxEntries > 0) || !(ttlMs > 0)) {
    throw new Error("cache maxEntries and ttlMs must be positive");
  }
  // Map preserves insertion order; re-inserting on access keeps recency order.
  const store = new Map<string, Entry<T>>();

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (now() >= entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      store.delete(key);
      store.set(key, entry);
      return structuredClone(entry.value);
    },
    set(key, value, entryTtlMs) {
      store.delete(key);
      store.set(key, { value: structuredClone(value), expiresAt: now() + (entryTtlMs ?? ttlMs) });
      while (store.size > maxEntries) {
        const oldest = store.keys().next().value as string;
        store.delete(oldest);
      }
    },
    size: () => store.size,
    clear: () => store.clear(),
  };
}
