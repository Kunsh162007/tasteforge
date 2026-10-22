import { withJsonCache } from "./cache";
import { createCascade, type CascadeEntry } from "./cascade";
import { loadLlmConfig, type ChainEntry, type LlmConfig } from "./config";
import { createGeminiProvider } from "./gemini";
import { createGroqProvider } from "./groq";
import type { Observation } from "./tokenBudget";
import { routeOf } from "./route";
import { createScriptedLlm } from "./scripted";
import { createTokenBudget, type TokenBudget } from "./tokenBudget";
import type { LlmError, LlmProvider } from "./types";

export { createMockLlm, type MockJsonStep, type MockLlm } from "./mock";
export { loadLlmConfig, parseLlmChain, type LlmConfig, type ChainEntry } from "./config";
export { createCascade, cooldownUntil } from "./cascade";
export { createScriptedLlm } from "./scripted";
export { createTokenBudget, type TokenBudget } from "./tokenBudget";
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
  /** Called once per upstream request actually sent (cache hits excluded). */
  readonly onCall?: () => void;
  readonly now?: () => number;
  /** Per-model token budget; by default one is built from the config (Groq models are tracked, Gemini is not). */
  readonly budget?: TokenBudget;
  readonly sleep?: (ms: number) => Promise<void>;
};

function entryFor(e: ChainEntry, config: LlmConfig, o: CreateLlmOptions, budget: TokenBudget): CascadeEntry {
  const id = `${e.provider}:${e.model}`;
  if (e.provider === "gemini") {
    return { id, provider: createGeminiProvider({ apiKey: config.geminiApiKey as string, model: e.model, fetchImpl: o.fetchImpl }) };
  }
  const onUsage = (obs: Observation): void => budget.observe(id, obs);
  return { id, provider: createGroqProvider({ apiKey: config.groqApiKey as string, model: e.model, fetchImpl: o.fetchImpl, onUsage }) };
}

/** Groq's free tier meters tokens per minute separately for every model; Gemini's limits are handled by cooldowns. */
function budgetFor(config: LlmConfig, now: (() => number) | undefined): TokenBudget {
  const limits = Object.fromEntries(Object.entries(config.groqTokenLimits).map(([model, tokens]) => [`groq:${model}`, tokens]));
  return createTokenBudget({ now, limits, defaultLimit: config.groqTokensPerMinute, tracks: (id) => id.startsWith("groq:") });
}

export { routeOf };

/**
 * Builds the model cascades from the config (see LLM_CHAIN_FAST / LLM_CHAIN_MAIN), wrapped in the JSON response cache.
 * The two chains share their cooldowns, so a model that hit a quota is skipped by both. The provider's name is the
 * model that last answered a main (synthesis) call.
 */
export function createLlm(config: LlmConfig = loadLlmConfig(), o: CreateLlmOptions = {}): LlmProvider {
  if (config.provider === "mock") return createScriptedLlm();
  const cooldowns = new Map<string, number>();
  const budget = o.budget ?? budgetFor(config, o.now);
  const build = (chain: readonly ChainEntry[]): LlmProvider =>
    createCascade(
      chain.map((e) => entryFor(e, config, o, budget)),
      {
        now: o.now,
        onCall: o.onCall,
        cooldowns,
        budget,
        sleep: o.sleep,
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
