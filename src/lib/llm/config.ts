export type LlmProviderName = "gemini" | "groq" | "mock";

export type ChainProvider = "gemini" | "groq";
export type ChainEntry = { readonly provider: ChainProvider; readonly model: string };

export type LlmConfig = {
  /** "mock" selects scripted output; otherwise the cascade in `chain` is used. */
  readonly provider: LlmProviderName;
  /** Ordered models to try, already filtered to providers that have an API key. */
  readonly chain: readonly ChainEntry[];
  readonly geminiApiKey?: string;
  readonly geminiModel: string;
  /** Legacy (pre-cascade) setting, kept readable; the cascade ignores it. */
  readonly geminiLightModel: string;
  readonly groqApiKey?: string;
  readonly groqModel: string;
};

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const DEFAULT_GEMINI_LIGHT_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
/** Gemini free tiers are small and per-model, so the chain spreads load across models, then Groq. */
export const DEFAULT_LLM_CHAIN =
  "gemini:gemini-3.5-flash-lite,gemini:gemini-3.5-flash,gemini:gemini-2.5-flash,groq:openai/gpt-oss-120b,groq:qwen/qwen3.8-27b";

type Env = Readonly<Record<string, string | undefined>>;

const clean = (v: string | undefined): string | undefined => {
  const t = v?.trim();
  return t ? t : undefined;
};

/** Parses "provider:model,provider:model" (model ids may contain slashes). */
export function parseLlmChain(spec: string): ChainEntry[] {
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((part) => {
      const at = part.indexOf(":");
      const provider = part.slice(0, at);
      const model = part.slice(at + 1).trim();
      if (at < 1 || !model || (provider !== "gemini" && provider !== "groq")) {
        throw new Error(`LLM_CHAIN entries must look like "gemini:<model>" or "groq:<model>" (got "${part}")`);
      }
      return { provider, model };
    });
}

const keyOf = (e: ChainEntry) => `${e.provider}:${e.model}`;

function dedupe(entries: readonly ChainEntry[]): ChainEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (seen.has(keyOf(e))) return false;
    seen.add(keyOf(e));
    return true;
  });
}

/** LLM_CHAIN wins; otherwise the default chain, led by the legacy GEMINI_MODEL / GROQ_MODEL / LLM_PROVIDER choices. */
function resolveChain(env: Env, provider: LlmProviderName): ChainEntry[] {
  const explicit = clean(env.LLM_CHAIN);
  if (explicit) return dedupe(parseLlmChain(explicit));
  const geminiModel = clean(env.GEMINI_MODEL);
  const groqModel = clean(env.GROQ_MODEL);
  const defaults = parseLlmChain(DEFAULT_LLM_CHAIN);
  const firstGroq = defaults.findIndex((e) => e.provider === "groq");
  // A legacy model leads its own provider's group, so GROQ_MODEL never jumps ahead of the Gemini models.
  const withGroq: ChainEntry[] = groqModel ? [...defaults.slice(0, firstGroq), { provider: "groq", model: groqModel }, ...defaults.slice(firstGroq)] : defaults;
  const all = dedupe([...(geminiModel ? [{ provider: "gemini" as const, model: geminiModel }] : []), ...withGroq]);
  if (provider !== "groq") return all;
  return [...all.filter((e) => e.provider === "groq"), ...all.filter((e) => e.provider === "gemini")];
}

/** Reads LLM settings. Throws a key-free message when no model in the chain has an API key. */
export function loadLlmConfig(env: Env = process.env): LlmConfig {
  const raw = clean(env.LLM_PROVIDER) ?? "gemini";
  if (raw !== "gemini" && raw !== "groq" && raw !== "mock") {
    throw new Error(`LLM_PROVIDER must be "gemini", "groq" or "mock" (got "${raw}")`);
  }
  const geminiApiKey = clean(env.GEMINI_API_KEY);
  const groqApiKey = clean(env.GROQ_API_KEY);
  const base = {
    provider: raw,
    geminiApiKey,
    geminiModel: clean(env.GEMINI_MODEL) ?? DEFAULT_GEMINI_MODEL,
    geminiLightModel: clean(env.GEMINI_LIGHT_MODEL) ?? DEFAULT_GEMINI_LIGHT_MODEL,
    groqApiKey,
    groqModel: clean(env.GROQ_MODEL) ?? DEFAULT_GROQ_MODEL,
  } as const;
  if (raw === "mock") return { ...base, chain: [] };
  if (raw === "groq" && !groqApiKey) throw new Error("GROQ_API_KEY is required when LLM_PROVIDER=groq.");
  const chain = resolveChain(env, raw).filter((e) => (e.provider === "gemini" ? geminiApiKey : groqApiKey));
  if (chain.length === 0) {
    throw new Error("GEMINI_API_KEY (or GROQ_API_KEY) is required: no model in LLM_CHAIN has an API key.");
  }
  return { ...base, chain };
}
