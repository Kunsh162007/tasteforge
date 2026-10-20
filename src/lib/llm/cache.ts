import { createHash } from "node:crypto";
import { createCache, type Cache } from "@/lib/qloo/cache";
import type { JsonRequest, LlmProvider } from "./types";

const CACHE_MAX_ENTRIES = 200;
const CACHE_TTL_MS = 60 * 60 * 1000;

export type JsonCacheOptions = {
  readonly cache?: Cache<unknown>;
};

/** Stable hash of everything that shapes a JSON-mode answer. */
export function jsonRequestKey(req: JsonRequest): string {
  const payload = JSON.stringify([req.tier ?? "main", req.route ?? null, req.system, req.prompt, req.schema ?? null]);
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Caches `chatJson` answers by request hash (in-memory LRU) and shares one in-flight call between
 * identical concurrent requests. Failures are never cached.
 */
export function withJsonCache(inner: LlmProvider, o: JsonCacheOptions = {}): LlmProvider {
  const cache = o.cache ?? createCache<unknown>({ maxEntries: CACHE_MAX_ENTRIES, ttlMs: CACHE_TTL_MS });
  const inflight = new Map<string, Promise<unknown>>();
  return {
    get name() {
      return inner.name;
    },
    async chatJson(req) {
      const key = jsonRequestKey(req);
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const pending = inflight.get(key) ?? inner.chatJson(req);
      inflight.set(key, pending);
      try {
        const value = await pending;
        cache.set(key, value);
        return value;
      } finally {
        inflight.delete(key);
      }
    },
  };
}
