import { postJson } from "./http";
import { parseJsonText } from "./json";
import type { Observation } from "./tokenBudget";
import { LlmError, REPLY_TOKEN_CAP, type JsonObject, type JsonRequest, type LlmProvider } from "./types";

const PROVIDER = "groq";
/** verified live 2026-10-20: the free tier rejects (HTTP 413) requests over its 8000-token minute budget; leave room for the reply. */
const MAX_REQUEST_TOKENS = 5_500;
const CHARS_PER_TOKEN = 3.3;

/** The same schema without `description` texts: a request with a compact prompt is token-bound, and its system prompt explains the fields. */
function withoutDescriptions(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutDescriptions);
  if (!node || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([k, v]) => !(k === "description" && typeof v === "string"))
      .map(([k, v]) => [k, withoutDescriptions(v)]),
  );
}

const schemaFor = (req: JsonRequest): JsonObject | undefined => (req.compactPrompt ? (withoutDescriptions(req.schema) as JsonObject | undefined) : req.schema);

/** The compact prompt, when there is one and the full request would not fit the token budget. */
function promptFor(req: JsonRequest): string {
  if (!req.compactPrompt) return req.prompt;
  const size = req.system.length + schemaInstruction(schemaFor(req)).length + req.prompt.length;
  return size / CHARS_PER_TOKEN > MAX_REQUEST_TOKENS ? req.compactPrompt : req.prompt;
}

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

/** Reasoning is the main latency cost on Groq's reasoning models, and these JSON tasks need very little of it. */
export function reasoningEffortFor(model: string): string | undefined {
  if (/gpt-oss/.test(model)) return "low";
  if (/qwen3/.test(model)) return "none";
  return undefined;
}

/**
 * Sampling temperature: 0 for every call (seeds, critic, brief). The same request should give the same picks, so repeat runs
 * of a brief differ only where Qloo itself changes; the writer's wording stays fluent at 0.
 */
export const TEMPERATURE = { light: 0, main: 0 } as const;

export type GroqOptions = {
  readonly apiKey: string;
  readonly model: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  /** Receives the rate-limit headers and token usage of every reply, to steer load towards models with room. */
  readonly onUsage?: (o: Observation) => void;
};

const numberHeader = (h: Headers, name: string): number | undefined => {
  const n = Number(h.get(name));
  return h.get(name) !== null && Number.isFinite(n) ? n : undefined;
};

/** Groq's `x-ratelimit-*` headers: the provider's own count of the model's free tokens this minute. */
export function rateLimitObservation(h: Headers): Observation {
  const remainingTokens = numberHeader(h, "x-ratelimit-remaining-tokens");
  const limitTokens = numberHeader(h, "x-ratelimit-limit-tokens");
  return { ...(remainingTokens !== undefined ? { remainingTokens } : {}), ...(limitTokens !== undefined ? { limitTokens } : {}) };
}

/** Tokens a reply reports having used (prompt plus completion). */
export function usedTokens(raw: unknown): number | undefined {
  const total = (raw as { usage?: { total_tokens?: unknown } } | null)?.usage?.total_tokens;
  return typeof total === "number" && Number.isFinite(total) ? total : undefined;
}

function parseText(raw: unknown): string {
  const message = (raw as { choices?: { message?: Record<string, unknown> }[] })?.choices?.[0]?.message;
  if (!message) throw new LlmError(PROVIDER, "invalid_response", "Groq returned no choices.");
  return typeof message.content === "string" ? message.content.trim() : "";
}

function schemaInstruction(schema: JsonObject | undefined): string {
  return schema ? `

Reply with one JSON object that matches this JSON schema exactly:
${JSON.stringify(schema)}` : "";
}

export function createGroqProvider(o: GroqOptions): LlmProvider {
  const fetchImpl = o.fetchImpl ?? fetch;
  const call = (body: JsonObject) =>
    postJson({
      provider: PROVIDER,
      url: ENDPOINT,
      headers: { authorization: `Bearer ${o.apiKey}` },
      body,
      fetchImpl,
      timeoutMs: o.timeoutMs ?? 60_000,
      onHeaders: o.onUsage ? (h) => o.onUsage?.(rateLimitObservation(h)) : undefined,
    });
  return {
    name: PROVIDER,
    async chatJson(req: JsonRequest): Promise<unknown> {
      const body: JsonObject = {
        model: o.model,
        messages: [
          { role: "system", content: `${req.system}${schemaInstruction(schemaFor(req))}` },
          { role: "user", content: promptFor(req) },
        ],
        response_format: { type: "json_object" },
        temperature: TEMPERATURE[req.tier ?? "main"],
        max_completion_tokens: REPLY_TOKEN_CAP[(req.route ?? (req.tier === "light" ? "fast" : "main"))],
        ...(reasoningEffortFor(o.model) ? { reasoning_effort: reasoningEffortFor(o.model) } : {}),
      };
      const raw = await call(body);
      const tokens = usedTokens(raw);
      if (tokens !== undefined) o.onUsage?.({ tokens });
      return parseJsonText(PROVIDER, parseText(raw));
    },
  };
}
