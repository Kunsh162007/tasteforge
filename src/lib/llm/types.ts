/** Provider-neutral LLM types. Adapters translate these to Gemini / Groq wire formats. */

export type JsonObject = Readonly<Record<string, unknown>>;

export type ToolDefinition = {
  readonly name: string;
  readonly description: string;
  /** JSON-schema subset (type, properties, required, items, enum, description). */
  readonly parameters: JsonObject;
};

export type ToolCall = {
  readonly id: string;
  readonly name: string;
  readonly args: JsonObject;
};

/** "light" selects the cheaper model (seeds, critic, baseline); "main" the synthesis model. */
export type JsonTier = "main" | "light";

/** Which model chain answers: "fast" for short calls (seeds, critic, baseline), "main" for the brief synthesis. */
export type JsonRoute = "fast" | "main";

/** JSON-mode request: no tools, the reply is a single JSON document. */
export type JsonRequest = {
  readonly system: string;
  readonly prompt: string;
  /** JSON schema the reply must follow (sanitized subset). */
  readonly schema?: JsonObject;
  readonly tier?: JsonTier;
  /** Chain to use; defaults to "fast" for the light tier and "main" otherwise. */
  readonly route?: JsonRoute;
  /** A shorter prompt for a provider with a small token budget (the Groq free tier allows 8000 tokens a minute). */
  readonly compactPrompt?: string;
  /**
   * Called when the request has to wait for capacity (every model is cooling down or out of its per-minute tokens):
   * the pipeline turns it into a "high demand" notice. Never part of the response cache key.
   */
  readonly onWait?: (info: { readonly waitMs: number }) => void;
  /** Epoch ms after which the caller gives up; the cascade does not queue past it. */
  readonly deadlineAt?: number;
  /** Told which model ("groq:openai/gpt-oss-120b") answered this very request, whatever other requests ran meanwhile. */
  readonly onAnswered?: (modelId: string) => void;
};

/**
 * Most tokens a reply may use, per call route. Groq checks "prompt plus the reply you allow" against a model's
 * per-minute budget before it answers, so an explicit cap keeps a brief within it (verified live 2026-10-21: a
 * 4k-token synthesis prompt with no cap was refused with HTTP 429 while the bucket was nearly full; the reply itself is
 * 1.5k to 2.2k tokens). The cascade reserves budget for the same amount.
 */
export const REPLY_TOKEN_CAP = { main: 3_000, fast: 800 } as const;

export type LlmProvider = {
  readonly name: string;
  /** JSON mode: returns the parsed document, or throws LlmError (invalid_response when unparsable). */
  chatJson(request: JsonRequest): Promise<unknown>;
};

export type LlmErrorKind = "auth" | "rate_limit" | "server" | "bad_request" | "network" | "timeout" | "invalid_response";

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly status?: number;
  readonly provider: string;

  /** Server-suggested wait before retrying (429 / 503), in milliseconds. */
  readonly retryAfterMs?: number;
  /** For rate limits: whether a per-day quota is exhausted. */
  readonly quota?: "day" | "minute";
  /** For rate limits: the provider's own explanation with identifiers removed ("Limit 8000, Used 7100, Requested 5200"), for server logs. */
  readonly detail?: string;

  constructor(
    provider: string,
    kind: LlmErrorKind,
    message: string,
    status?: number,
    hints: { readonly retryAfterMs?: number; readonly quota?: "day" | "minute"; readonly detail?: string } = {},
  ) {
    super(message);
    this.name = "LlmError";
    this.provider = provider;
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = hints.retryAfterMs;
    this.quota = hints.quota;
    this.detail = hints.detail;
  }

  get retryable(): boolean {
    return this.kind === "rate_limit" || this.kind === "server" || this.kind === "network" || this.kind === "timeout";
  }
}
