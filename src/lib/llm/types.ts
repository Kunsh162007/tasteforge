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

/** JSON-mode request: no tools, the reply is a single JSON document. */
export type JsonRequest = {
  readonly system: string;
  readonly prompt: string;
  /** JSON schema the reply must follow (sanitized subset). */
  readonly schema?: JsonObject;
  readonly tier?: JsonTier;
  /** A shorter prompt for a provider with a small token budget (the Groq free tier allows 8000 tokens a minute). */
  readonly compactPrompt?: string;
};

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

  constructor(
    provider: string,
    kind: LlmErrorKind,
    message: string,
    status?: number,
    hints: { readonly retryAfterMs?: number; readonly quota?: "day" | "minute" } = {},
  ) {
    super(message);
    this.name = "LlmError";
    this.provider = provider;
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = hints.retryAfterMs;
    this.quota = hints.quota;
  }

  get retryable(): boolean {
    return this.kind === "rate_limit" || this.kind === "server" || this.kind === "network" || this.kind === "timeout";
  }
}
