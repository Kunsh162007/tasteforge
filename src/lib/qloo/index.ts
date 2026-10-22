import { createQlooClient, type QlooClient } from "./client";
import { loadQlooConfig } from "./config";

export { createQlooClient, type QlooClient, type QlooClientOptions, type QlooRetryOptions } from "./client";
export { createCache, type Cache } from "./cache";
export { DEFAULT_QLOO_BASE_URL, loadQlooConfig } from "./config";
export { QlooError, type QlooErrorKind } from "./errors";
export {
  formatQuotaLine,
  getQuota,
  quotaSummary,
  recordRateLimitHeaders,
  type QuotaState,
  type QuotaSummary,
} from "./quota";
export { createMockFetch } from "./mock";
export {
  demographicsQuery,
  entityTagsQuery,
  heatmapQuery,
  insightsQuery,
  searchQuery,
  tagsQuery,
  trendingQuery,
} from "./query";
export * from "./types";

/** Builds a client from environment variables (defaults to mock mode). */
export function createQlooClientFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): QlooClient {
  return createQlooClient(loadQlooConfig(env));
}
