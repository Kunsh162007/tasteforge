import type { QlooConfig, QlooMode } from "./types";

export const DEFAULT_QLOO_BASE_URL = "https://hackathon.api.qloo.com";

type Env = Readonly<Record<string, string | undefined>>;

function clean(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

function parseMode(raw: string | undefined): QlooMode {
  if (raw === undefined) return "mock";
  if (raw === "mock" || raw === "live") return raw;
  throw new Error(`QLOO_MODE must be "mock" or "live" (got "${raw}")`);
}

function parseBaseUrl(raw: string | undefined): string {
  const value = raw ?? DEFAULT_QLOO_BASE_URL;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`QLOO_BASE_URL is not a valid URL (got "${value}")`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("QLOO_BASE_URL must start with http:// or https://");
  }
  return value.replace(/\/+$/, "");
}

/** Reads and validates Qloo settings. Mock is the default so the app runs without a key. */
export function loadQlooConfig(env: Env = process.env): QlooConfig {
  const mode = parseMode(clean(env.QLOO_MODE));
  const apiKey = clean(env.QLOO_API_KEY);
  const baseUrl = parseBaseUrl(clean(env.QLOO_BASE_URL));
  if (mode === "live" && !apiKey) {
    throw new Error(
      "QLOO_API_KEY is required when QLOO_MODE=live. Set it in .env.local, or use QLOO_MODE=mock.",
    );
  }
  return { mode, apiKey, baseUrl };
}
