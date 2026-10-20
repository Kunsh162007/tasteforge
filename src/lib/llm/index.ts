import { withJsonCache } from "./cache";
import { createCascade, type CascadeEntry } from "./cascade";
import { loadLlmConfig, type ChainEntry, type LlmConfig } from "./config";
import { createGeminiProvider } from "./gemini";
import { createGroqProvider } from "./groq";
import { createScriptedLlm } from "./scripted";
import type { JsonRequest, LlmError, LlmProvider } from "./types";

export { createMockLlm, type MockJsonStep, type MockLlm } from "./mock";
export { loadLlmConfig, parseLlmChain, type LlmConfig, type ChainEntry } from "./config";
export { createCascade, cooldownUntil } from "./cascade";
export { createScriptedLlm } from "./scripted";
export { withRetry } from "./retry";
export { withJsonCache } from "./cache";
export { parseJsonText } from "./json";
export * from "./types";

export type CreateLlmOptions = {
  /** Called when a model fails and the cascade moves on to the next one. */
  readonly onFallback?: (error: LlmError, from: string, to: string) => void;
  readonly fetchImpl?: typeof fetch;
  /** Pass false to disable the in-memory JSON response cache. */
  readonly cache?: boolean;
  /** Called once per upstream request actually sent (cache hits excluded): feeds the daily budget. */
  readonly onCall?: () => void;
  readonly now?: () => number;
};

function entryFor(e: ChainEntry, config: LlmConfig, fetchImpl: typeof fetch | undefined): CascadeEntry {
  const id = `${e.provider}:${e.model}`;
  if (e.provider === "gemini") {
    return { id, provider: createGeminiProvider({ apiKey: config.geminiApiKey as string, model: e.model, fetchImpl }) };
  }
  return { id, provider: createGroqProvider({ apiKey: config.groqApiKey as string, model: e.model, fetchImpl }) };
}

/** The chain a request is routed to: explicit route, else "fast" for the light tier. */
export const routeOf = (req: JsonRequest): "fast" | "main" => req.route ?? (req.tier === "light" ? "fast" : "main");

/**
 * Builds the model cascades from the config (see LLM_CHAIN_FAST / LLM_CHAIN_MAIN), wrapped in the JSON response cache.
 * The two chains share their cooldowns, so a model that hit a quota is skipped by both. The provider's name is the
 * model that last answered a main (synthesis) call.
 */
export function createLlm(config: LlmConfig = loadLlmConfig(), o: CreateLlmOptions = {}): LlmProvider {
  if (config.provider === "mock") return createScriptedLlm();
  const cooldowns = new Map<string, number>();
  const build = (chain: readonly ChainEntry[]): LlmProvider =>
    createCascade(
      chain.map((e) => entryFor(e, config, o.fetchImpl)),
      {
        now: o.now,
        onCall: o.onCall,
        cooldowns,
        onSwitch: o.onFallback ? (from, to, error) => o.onFallback?.(error, from, to) : undefined,
      },
    );
  const main = build(config.chain);
  const fast = build(config.fastChain);
  const routed: LlmProvider = {
    get name() {
      return main.name;
    },
    chatJson: (req) => (routeOf(req) === "fast" ? fast : main).chatJson(req),
  };
  return o.cache === false ? routed : withJsonCache(routed);
}
