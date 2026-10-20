import { loadLlmConfig } from "@/lib/llm/config";
import { loadQlooConfig } from "@/lib/qloo/config";

/**
 * Startup validation of the server environment. Messages name the variable and the fix, and never
 * include a value (keys must not reach logs or the health endpoint).
 */

type Env = Readonly<Record<string, string | undefined>>;

export type EnvReport = { readonly errors: readonly string[]; readonly warnings: readonly string[] };

/** Same threshold the ledger signer enforces. */
const MIN_LEDGER_SECRET_CHARS = 16;

const present = (v: string | undefined): boolean => Boolean(v?.trim());

function attempt(check: () => unknown): string | undefined {
  try {
    check();
    return undefined;
  } catch (e) {
    return e instanceof Error ? e.message : "invalid configuration";
  }
}

export function validateEnv(env: Env = process.env): EnvReport {
  const errors = [attempt(() => loadQlooConfig(env)), attempt(() => loadLlmConfig(env))].filter((m): m is string => m !== undefined);
  const warnings: string[] = [];
  if (env.NODE_ENV === "production" && errors.length === 0) {
    if ((env.QLOO_MODE ?? "mock") === "mock") warnings.push("QLOO_MODE=mock: briefs use synthetic Qloo data. Set QLOO_MODE=live with QLOO_API_KEY for real taste data.");
    if (env.LLM_PROVIDER === "mock") warnings.push("LLM_PROVIDER=mock: briefs use scripted output. Unset it and set GEMINI_API_KEY and/or GROQ_API_KEY.");
    if ((env.LEDGER_SECRET?.trim().length ?? 0) < MIN_LEDGER_SECRET_CHARS) {
      warnings.push(`LEDGER_SECRET is not set or shorter than ${MIN_LEDGER_SECRET_CHARS} characters: shared links stop verifying whenever the server restarts. Set a long random value.`);
    }
    if (!present(env.GROQ_API_KEY)) warnings.push("GROQ_API_KEY is not set: the default chains lead with Groq models (about 5 s a brief); without it Gemini answers alone, 3 to 8 times slower, with no fallback when its free tiers run out.");
    if (!present(env.NEXT_PUBLIC_SITE_URL) && !present(env.RENDER_EXTERNAL_URL) && !present(env.VERCEL_PROJECT_PRODUCTION_URL)) {
      warnings.push("NEXT_PUBLIC_SITE_URL is not set: link previews will use http://localhost:3000 for their image URLs.");
    }
  }
  return { errors, warnings };
}

/** Model ids of the configured chain (names only), or [] when the configuration is invalid or scripted. */
function chainOf(env: Env, which: "chain" | "fastChain" = "chain"): string[] {
  try {
    return loadLlmConfig(env)[which].map((e) => `${e.provider}:${e.model}`);
  } catch {
    return [];
  }
}

export type Health = {
  readonly status: "ok" | "misconfigured";
  readonly version: string;
  readonly qloo: { readonly mode: string; readonly keyConfigured: boolean };
  readonly llm: { readonly provider: string; readonly gemini: boolean; readonly groq: boolean; readonly chain: readonly string[]; readonly fastChain: readonly string[] };
  readonly problems: readonly string[];
};

/** Booleans and names only: safe to expose publicly. */
export function buildHealth(env: Env, version: string): Health {
  const { errors } = validateEnv(env);
  return {
    status: errors.length === 0 ? "ok" : "misconfigured",
    version,
    qloo: { mode: env.QLOO_MODE?.trim() || "mock", keyConfigured: present(env.QLOO_API_KEY) },
    llm: { provider: env.LLM_PROVIDER?.trim() || "gemini", gemini: present(env.GEMINI_API_KEY), groq: present(env.GROQ_API_KEY), chain: chainOf(env), fastChain: chainOf(env, "fastChain") },
    problems: errors,
  };
}
