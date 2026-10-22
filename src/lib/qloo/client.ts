import { createCache, type Cache } from "./cache";
import { errorForStatus, QlooError } from "./errors";
import { getQuota, recordRateLimitHeaders, secondAllowanceLow, secondWaitMs } from "./quota";
import { createMockFetch } from "./mock";
import {
  normalizeDemographics,
  normalizeEntities,
  normalizeHeatmap,
  normalizeTags,
  normalizeTrending,
  withEmptyWarning,
} from "./normalize";
import {
  demographicsQuery,
  entityTagsQuery,
  heatmapQuery,
  insightsQuery,
  searchQuery,
  tagsQuery,
  trendingQuery,
} from "./query";
import type {
  Demographics,
  DemographicsParams,
  EntityTagsParams,
  HeatmapCell,
  HeatmapParams,
  InsightsParams,
  QlooEntity,
  QlooMode,
  QlooResult,
  QlooTag,
  SearchParams,
  TagSearchParams,
  TrendingParams,
  TrendPoint,
} from "./types";

export type QlooClientOptions = {
  readonly apiKey?: string;
  readonly baseUrl: string;
  readonly mode: QlooMode;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  /** Pass `false` to disable caching, or supply your own cache. */
  readonly cache?: Cache<unknown> | false;
  readonly retry?: QlooRetryOptions;
  /**
   * Max requests in flight. verified live 2026-10-20: the hackathon key answers 429 for bursts of more than ~5
   * requests in a second, so live mode defaults to 4 in flight with a 250 ms gap between starts; mock is unlimited.
   */
  readonly maxConcurrent?: number;
  /** Minimum gap between request starts, in ms. */
  readonly minGapMs?: number;
  /**
   * Hedged request: when no answer arrives within this many ms (and before the timeout), one duplicate request is
   * sent and the first success wins. Live mode defaults to 8 s; 0 disables.
   */
  readonly hedgeAfterMs?: number;
};

export type QlooRetryOptions = {
  /** Extra attempts after a 429, 5xx or timeout (default 1; a 429 gets one more). */
  readonly retries?: number;
  /** Base delay; the actual wait is jittered between 0.5x and 1.5x of it. */
  readonly baseDelayMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
};

export type QlooClient = {
  search(p: SearchParams): Promise<QlooResult<QlooEntity>>;
  findTags(p: TagSearchParams): Promise<QlooResult<QlooTag>>;
  insights(p: InsightsParams): Promise<QlooResult<QlooEntity>>;
  entityTags(p: EntityTagsParams): Promise<QlooResult<QlooTag>>;
  demographics(p: DemographicsParams): Promise<QlooResult<Demographics>>;
  heatmap(p: HeatmapParams): Promise<QlooResult<HeatmapCell>>;
  trending(p: TrendingParams): Promise<QlooResult<TrendPoint>>;
};

/**
 * verified live 2026-10-20: broad insights queries (films, London places) regularly take 5 to 10 s and sometimes 25 to 40 s.
 * Measured again 2026-10-20 (profile:live): the same New York place query answered in 3.5 s, 12 s and not at all in 30 s,
 * so a short timeout plus one hedged duplicate beats one long wait.
 */
const DEFAULT_TIMEOUT_MS = 15_000;
const LIVE_HEDGE_AFTER_MS = 8_000;
/** Name searches and tag lookups do not change from hour to hour. */
const STABLE_TTL_MS = 24 * 60 * 60 * 1000;
const STABLE_PATHS = ["/search", "/v2/tags"];
const CACHE_MAX_ENTRIES = 500;
const MAX_TREND_ENTITIES = 3;
const CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_RETRIES = 1;
/** Rate limits clear within a second or two, so they get this many extra attempts on top of `retries`. */
const EXTRA_RATE_LIMIT_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 600;

const LIVE_MAX_CONCURRENT = 4;
const LIVE_MIN_GAP_MS = 250;

/** Runs tasks with at most `limit` in flight; the rest wait in order. */
function createLimiter(limit: number, minGapMs: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  let nextStart = 0;
  const waiting: (() => void)[] = [];
  const release = (): void => {
    active -= 1;
    waiting.shift()?.();
  };
  return async (task) => {
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      // Reserve a start slot synchronously so concurrent callers queue behind each other.
      const wait = Math.max(0, nextStart - Date.now());
      nextStart = Date.now() + wait + minGapMs;
      if (wait > 0) await defaultSleep(wait);
      return await task();
    } finally {
      release();
    }
  };
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Worth one more try: rate limited or server trouble. Client errors would fail the same way again, and so would a
 * timeout (verified live 2026-10-20: the slow Qloo queries are slow every time), which only burns the run's budget.
 */
function isTransient(e: unknown): boolean {
  if (!(e instanceof QlooError)) return false;
  // A spent month allowance does not clear on a retry.
  if (e.kind === "rate_limit" && getQuota().month?.remaining === 0) return false;
  return e.kind === "rate_limit" || (e.kind === "http" && (e.status ?? 0) >= 500);
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new QlooError("invalid_response", "Qloo returned a response that is not valid JSON.");
  }
}

export function createQlooClient(options: QlooClientOptions): QlooClient {
  const { apiKey, baseUrl, mode, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  if (mode === "live" && !apiKey) {
    throw new Error("QLOO_API_KEY is required when QLOO_MODE=live.");
  }
  const fetchImpl = options.fetchImpl ?? (mode === "mock" ? createMockFetch() : fetch);
  // Mock data is cheap and must reflect param changes, so only live traffic is cached.
  const cache =
    options.cache === false || (mode === "mock" && options.cache === undefined)
      ? undefined
      : (options.cache ?? createCache<unknown>({ maxEntries: CACHE_MAX_ENTRIES, ttlMs: CACHE_TTL_MS }));

  const limit = createLimiter(
    options.maxConcurrent ?? (mode === "live" ? LIVE_MAX_CONCURRENT : Number.POSITIVE_INFINITY),
    options.minGapMs ?? (mode === "live" ? LIVE_MIN_GAP_MS : 0),
  );

  type Attempt = { readonly promise: Promise<unknown>; abort(): void };

  /** One HTTP request with its own timeout; `abort` cancels it (the loser of a hedge). */
  function startSend(url: string): Attempt {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const run = async (): Promise<unknown> => {
      try {
        const headers: Record<string, string> = { Accept: "application/json" };
        if (apiKey) headers["X-Api-Key"] = apiKey;
        const res = await fetchImpl(url, { method: "GET", headers, signal: controller.signal });
        recordRateLimitHeaders(res.headers);
        if (!res.ok) throw errorForStatus(res.status);
        return await readJson(res);
      } catch (e) {
        if (e instanceof QlooError) throw e;
        if (isAbort(e)) {
          throw new QlooError("timeout", `Qloo request timed out after ${timeoutMs}ms.`);
        }
        // Original message is dropped on purpose: it could echo request details.
        throw new QlooError("network", "Could not reach Qloo (network error).");
      } finally {
        clearTimeout(timer);
      }
    };
    return { promise: run(), abort: () => controller.abort() };
  }

  const hedgeAfterMs = options.hedgeAfterMs ?? (mode === "live" ? LIVE_HEDGE_AFTER_MS : 0);

  /**
   * Sends the request and, when it is slow, one duplicate; the first success wins and cancels the other. A failure
   * before the duplicate was sent is returned as it is (the retry layer decides); after it, both must fail.
   */
  function send(url: string): Promise<unknown> {
    const first = startSend(url);
    if (hedgeAfterMs <= 0 || hedgeAfterMs >= timeoutMs) return first.promise;
    return new Promise<unknown>((resolve, reject) => {
      let hedge: Attempt | undefined;
      let settled = false;
      let failures = 0;
      const succeed = (v: unknown): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        first.abort();
        hedge?.abort();
        resolve(v);
      };
      const fail = (e: unknown): void => {
        failures += 1;
        if (settled || (hedge && failures < 2)) return;
        settled = true;
        clearTimeout(timer);
        reject(e);
      };
      const timer = setTimeout(() => {
        // A duplicate spends one of the few requests left in this second.
        if (settled || secondAllowanceLow()) return;
        hedge = startSend(url);
        hedge.promise.then(succeed, fail);
      }, hedgeAfterMs);
      first.promise.then(succeed, fail);
    });
  }

  const retries = options.retry?.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = options.retry?.baseDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const sleep = options.retry?.sleep ?? defaultSleep;
  const random = options.retry?.random ?? Math.random;

  /** One request, retried with jitter when the failure is transient. */
  async function sendWithRetry(url: string): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await limit(async () => {
          // Inside the limiter, so queued requests wait behind the one that waits for the second window to reset.
          const paceMs = secondWaitMs();
          if (paceMs > 0) await sleep(paceMs);
          return send(url);
        });
      } catch (e) {
        const allowed = retries + (e instanceof QlooError && e.kind === "rate_limit" ? EXTRA_RATE_LIMIT_RETRIES : 0);
        if (attempt >= allowed || !isTransient(e)) throw e;
        await sleep(Math.round(retryDelayMs * (0.5 + random())));
      }
    }
  }

  const inFlight = new Map<string, Promise<unknown>>();

  async function fetchAndCache(url: string, pathAndQuery: string): Promise<unknown> {
    const body = await sendWithRetry(url);
    const stable = STABLE_PATHS.some((p) => pathAndQuery === p || pathAndQuery.startsWith(`${p}?`));
    cache?.set(url, body, stable ? STABLE_TTL_MS : undefined);
    return body;
  }

  /** Identical requests that are already in flight share one answer (a prefetch and the call that needs it). */
  async function get(pathAndQuery: string): Promise<unknown> {
    const url = `${baseUrl}${pathAndQuery}`;
    const hit = cache?.get(url);
    if (hit !== undefined) return hit;
    const running = inFlight.get(url);
    if (running) return structuredClone(await running);
    const work = fetchAndCache(url, pathAndQuery);
    inFlight.set(url, work);
    try {
      return await work;
    } finally {
      inFlight.delete(url);
    }
  }

  return {
    search: async (p) =>
      withEmptyWarning(normalizeEntities(await get(searchQuery(p))), `search "${p.query}"`),
    findTags: async (p) =>
      withEmptyWarning(normalizeTags(await get(tagsQuery(p))), `tag search "${p.query}"`),
    insights: async (p) =>
      withEmptyWarning(normalizeEntities(await get(insightsQuery(p))), `insights for ${p.type}`),
    entityTags: async (p) =>
      withEmptyWarning(normalizeTags(await get(entityTagsQuery(p))), "entity tag analysis"),
    demographics: async (p) =>
      withEmptyWarning(normalizeDemographics(await get(demographicsQuery(p))), "demographics"),
    heatmap: async (p) =>
      withEmptyWarning(normalizeHeatmap(await get(heatmapQuery(p))), `heatmap in ${p.locationQuery}`),
    trending: async (p) => {
      // The API takes one entity per request, so fan out (capped) and tag each point with its entity.
      const ids = p.entities.slice(0, MAX_TREND_ENTITIES);
      const lists = await Promise.all(
        ids.map(async (id) =>
          normalizeTrending(await get(trendingQuery({ ...p, entities: [id] }))).map((pt) => ({ ...pt, entityId: id })),
        ),
      );
      return withEmptyWarning(lists.flat(), "trending");
    },
  };
}
