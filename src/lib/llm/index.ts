import { withJsonCache } from "./cache";
import { createCascade, type CascadeEntry } from "./cascade";
import { loadLlmConfig, type ChainEntry, type LlmConfig } from "./config";
import { createGeminiProvider } from "./gemini";
import { createGroqProvider } from "./groq";
import { createScriptedLlm } from "./scripted";
import type { LlmError, LlmProvider } from "./types";

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

/** Builds the model cascade from the config (see LLM_CHAIN), wrapped in the JSON response cache. */
export function createLlm(config: LlmConfig = loadLlmConfig(), o: CreateLlmOptions = {}): LlmProvider {
  if (config.provider === "mock") return createScriptedLlm();
  const llm = createCascade(
    config.chain.map((e) => entryFor(e, config, o.fetchImpl)),
    {
      now: o.now,
      onCall: o.onCall,
      onSwitch: o.onFallback ? (from, to, error) => o.onFallback?.(error, from, to) : undefined,
    },
  );
  return o.cache === false ? llm : withJsonCache(llm);
}
