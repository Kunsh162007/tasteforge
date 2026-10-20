import { createCache, type Cache } from "./cache";
import { errorForStatus, QlooError } from "./errors";
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

/** verified live 2026-10-20: broad insights queries (films, London places) regularly take 5 to 10 s and sometimes 25 to 40 s. */
const DEFAULT_TIMEOUT_MS = 30_000;
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

  async function send(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (apiKey) headers["X-Api-Key"] = apiKey;
      const res = await fetchImpl(url, { method: "GET", headers, signal: controller.signal });
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
  }

  const retries = options.retry?.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = options.retry?.baseDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const sleep = options.retry?.sleep ?? defaultSleep;
  const random = options.retry?.random ?? Math.random;

  /** One request, retried with jitter when the failure is transient. */
  async function sendWithRetry(url: string): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await limit(() => send(url));
      } catch (e) {
        const allowed = retries + (e instanceof QlooError && e.kind === "rate_limit" ? EXTRA_RATE_LIMIT_RETRIES : 0);
        if (attempt >= allowed || !isTransient(e)) throw e;
        await sleep(Math.round(retryDelayMs * (0.5 + random())));
      }
    }
  }

  async function get(pathAndQuery: string): Promise<unknown> {
    const url = `${baseUrl}${pathAndQuery}`;
    const hit = cache?.get(url);
    if (hit !== undefined) return hit;
    const body = await sendWithRetry(url);
    cache?.set(url, body);
    return body;
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
