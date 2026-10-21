export type LlmProviderName = "gemini" | "groq" | "mock";

export type ChainProvider = "gemini" | "groq";
export type ChainEntry = { readonly provider: ChainProvider; readonly model: string };

export type LlmConfig = {
  /** "mock" selects scripted output; otherwise the cascade in `chain` is used. */
  readonly provider: LlmProviderName;
  /** Models for the main call (brief synthesis), in order, already filtered to providers that have an API key. */
  readonly chain: readonly ChainEntry[];
  /** Models for the short calls (seeds, critic, baseline), in order, filtered the same way. */
  readonly fastChain: readonly ChainEntry[];
  readonly geminiApiKey?: string;
  readonly geminiModel: string;
  /** Legacy (pre-cascade) setting, kept readable; the cascade ignores it. */
  readonly geminiLightModel: string;
  readonly groqApiKey?: string;
  readonly groqModel: string;
  /** Tokens per minute a Groq model may use unless `groqTokenLimits` says otherwise (free tier: 8000 per model). */
  readonly groqTokensPerMinute: number;
  /** Per-model overrides of the per-minute limit, by model name ("openai/gpt-oss-120b"). */
  readonly groqTokenLimits: Readonly<Record<string, number>>;
};

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
export const DEFAULT_GEMINI_LIGHT_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
/**
 * Measured live on 2026-10-20 (docs/ARCHITECTURE.md): Groq answers the short JSON calls in 0.4 to 1 s and the synthesis in
 * 5 s, Gemini free tier in 9 to 21 s and 13 to 16 s (3.5 Flash-Lite often answers 503). Each Groq model has its own
 * 8000 tokens a minute, so a synthesis that does not fit falls through to Gemini 2.5 Flash, then to the next model.
 */
export const DEFAULT_LLM_CHAIN_FAST =
  "groq:openai/gpt-oss-20b,groq:qwen/qwen3.8-27b,groq:openai/gpt-oss-120b,gemini:gemini-2.5-flash,gemini:gemini-3.5-flash-lite";
export const DEFAULT_LLM_CHAIN_MAIN =
  "groq:openai/gpt-oss-120b,groq:qwen/qwen3.8-27b,gemini:gemini-2.5-flash,gemini:gemini-3.5-flash,gemini:gemini-3.5-flash-lite,groq:openai/gpt-oss-20b";
export const DEFAULT_GROQ_TOKENS_PER_MINUTE = 8_000;
export const DEFAULT_LLM_CHAIN = DEFAULT_LLM_CHAIN_MAIN;

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

/**
 * The route's own variable wins (LLM_CHAIN_FAST / LLM_CHAIN_MAIN), then the shared LLM_CHAIN, then the default,
 * led by the legacy GEMINI_MODEL / GROQ_MODEL / LLM_PROVIDER choices.
 */
function resolveChain(env: Env, provider: LlmProviderName, own: string | undefined, fallbackSpec: string): ChainEntry[] {
  const explicit = clean(own) ?? clean(env.LLM_CHAIN);
  if (explicit) return dedupe(parseLlmChain(explicit));
  const defaults = parseLlmChain(fallbackSpec);
  // A legacy model leads its own provider's group, so GEMINI_MODEL never jumps ahead of the Groq models that lead the defaults.
  const leading = (list: readonly ChainEntry[], p: ChainProvider, model: string | undefined): ChainEntry[] => {
    if (!model) return [...list];
    const at = list.findIndex((e) => e.provider === p);
    const entry: ChainEntry = { provider: p, model };
    return at < 0 ? [...list, entry] : [...list.slice(0, at), entry, ...list.slice(at)];
  };
  const all = dedupe(leading(leading(defaults, "gemini", clean(env.GEMINI_MODEL)), "groq", clean(env.GROQ_MODEL)));
  if (provider !== "groq") return all;
  return [...all.filter((e) => e.provider === "groq"), ...all.filter((e) => e.provider === "gemini")];
}

/** Parses "model=tokens,model=tokens" (model names may contain slashes); malformed entries are ignored. */
export function parseTokenLimits(spec: string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of (spec ?? "").split(",")) {
    const at = part.lastIndexOf("=");
    const tokens = Number(part.slice(at + 1));
    const model = part.slice(0, at).trim();
    if (at > 0 && model && Number.isFinite(tokens) && tokens > 0) out[model] = tokens;
  }
  return out;
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
    groqTokensPerMinute: Number(clean(env.GROQ_TOKENS_PER_MINUTE)) > 0 ? Number(env.GROQ_TOKENS_PER_MINUTE) : DEFAULT_GROQ_TOKENS_PER_MINUTE,
    groqTokenLimits: parseTokenLimits(env.GROQ_TOKEN_LIMITS),
  } as const;
  if (raw === "mock") return { ...base, chain: [], fastChain: [] };
  if (raw === "groq" && !groqApiKey) throw new Error("GROQ_API_KEY is required when LLM_PROVIDER=groq.");
  const keyed = (list: readonly ChainEntry[]) => list.filter((e) => (e.provider === "gemini" ? geminiApiKey : groqApiKey));
  const chain = keyed(resolveChain(env, raw, env.LLM_CHAIN_MAIN, DEFAULT_LLM_CHAIN_MAIN));
  const fastChain = keyed(resolveChain(env, raw, env.LLM_CHAIN_FAST, DEFAULT_LLM_CHAIN_FAST));
  if (chain.length === 0 || fastChain.length === 0) {
    throw new Error("GEMINI_API_KEY (or GROQ_API_KEY) is required: no model in LLM_CHAIN_MAIN / LLM_CHAIN_FAST has an API key.");
  }
  return { ...base, chain, fastChain };
}
