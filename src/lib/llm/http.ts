import { parseRateLimit } from "./ratelimit";
import { LlmError, type JsonObject } from "./types";

export type PostJsonOptions = {
  readonly provider: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: JsonObject;
  readonly fetchImpl: typeof fetch;
  readonly timeoutMs: number;
};

function kindForStatus(status: number): LlmError["kind"] {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  return "bad_request";
}

/** Builds the error for a non-2xx reply; keeps only the derived retry hints, never the body text. */
async function failure(provider: string, res: Response): Promise<LlmError> {
  const kind = kindForStatus(res.status);
  const message = `${provider} request failed with HTTP ${res.status}.`;
  if (kind !== "rate_limit" && res.status !== 503) return new LlmError(provider, kind, message, res.status);
  const body = await res.text().catch(() => "");
  const hints = parseRateLimit(res.headers.get("retry-after") ?? undefined, body);
  return new LlmError(provider, kind, message, res.status, kind === "rate_limit" ? hints : { retryAfterMs: hints.retryAfterMs });
}

/**
 * POSTs JSON and returns the parsed body. Errors never include headers, URLs or the
 * response body, so API keys cannot leak into logs or client messages.
 */
export async function postJson(o: PostJsonOptions): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), o.timeoutMs);
  try {
    const res = await o.fetchImpl(o.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...o.headers },
      body: JSON.stringify(o.body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw await failure(o.provider, res);
    }
    try {
      return await res.json();
    } catch {
      throw new LlmError(o.provider, "invalid_response", `${o.provider} returned invalid JSON.`);
    }
  } catch (e) {
    if (e instanceof LlmError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new LlmError(o.provider, "timeout", `${o.provider} request timed out.`);
    }
    throw new LlmError(o.provider, "network", `Could not reach ${o.provider}.`);
  } finally {
    clearTimeout(timer);
  }
}
