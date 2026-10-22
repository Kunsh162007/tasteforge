/**
 * Qloo live-check: settles every `// VERIFY with live key` item in the code and the plan's P4 risk checks
 * (seeds to places in Indore, London and Brooklyn, decor/ambience tags, heatmap boundary, filter.results.entities,
 * demographics, trending, entity type spellings, tag search parameter) and prints a PASS/WARN/FAIL table with the
 * recommended fix for each failure.
 *
 *   npm run qloo:check                  mock data (says so; proves nothing about the live API)
 *   npm run qloo:check -- --live        live API (same as QLOO_MODE=live; needs QLOO_API_KEY in the environment)
 *   npm run qloo:check -- --cities=London,Brooklyn
 *
 * The key is read from the environment (or .env.local, loaded without printing), sent only in the X-Api-Key header,
 * and never printed. Raw responses are never written to disk.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  createMockFetch,
  createQlooClient,
  formatQuotaLine,
  loadQlooConfig,
  recordRateLimitHeaders,
  type QlooConfig,
} from "../src/lib/qloo";
import {
  DEMO_CITIES,
  formatReport,
  linkVerifyItems,
  runChecks,
  scanVerifyItems,
  summarize,
  type Probe,
} from "../src/lib/qloo/check";

if (existsSync(".env.local")) process.loadEnvFile(".env.local"); // does not override variables already set
if (process.argv.includes("--live")) process.env.QLOO_MODE = "live";

const out = (line: string): void => void process.stdout.write(`${line}\n`);
const PROBE_TIMEOUT_MS = 15_000;

function citiesFromArgs(): readonly string[] {
  const arg = process.argv.find((a) => a.startsWith("--cities="));
  const list = arg?.slice("--cities=".length).split(",").map((c) => c.trim()).filter(Boolean);
  return list && list.length > 0 ? list : DEMO_CITIES;
}

function makeProbe(config: QlooConfig): Probe {
  const fetchImpl = config.mode === "mock" ? createMockFetch() : fetch;
  return async (path) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${config.baseUrl}${path}`, {
        headers: { Accept: "application/json", ...(config.apiKey ? { "X-Api-Key": config.apiKey } : {}) },
        signal: controller.signal,
      });
      recordRateLimitHeaders(res.headers);
      return { status: res.status, body: await res.json().catch(() => undefined) };
    } catch {
      return { status: 0, body: undefined };
    } finally {
      clearTimeout(timer);
    }
  };
}

async function main(): Promise<number> {
  let config: QlooConfig;
  try {
    config = loadQlooConfig();
  } catch (e) {
    out(`qloo:check cannot start: ${e instanceof Error ? e.message : "invalid configuration"}`);
    return 2;
  }
  const redact = (text: string): string => (config.apiKey ? text.split(config.apiKey).join("[redacted]") : text);

  if (config.mode === "mock") {
    out("MODE: mock. Running against SYNTHETIC mock data: this only proves the checks themselves work.");
    out("      Use `npm run qloo:check -- --live` (with QLOO_API_KEY set) to test the real API.");
  } else {
    out(`MODE: live against ${config.baseUrl} (key: ${config.apiKey ? "present" : "missing"})`);
  }

  const client = createQlooClient({ ...config, timeoutMs: PROBE_TIMEOUT_MS });
  const results = await runChecks({ client, probe: makeProbe(config), mode: config.mode, cities: citiesFromArgs(), now: new Date() });
  const verify = linkVerifyItems(scanVerifyItems(join(process.cwd(), "src"), process.cwd()), results);
  out(redact(formatReport(results, verify, process.stdout.isTTY === true)));
  out(formatQuotaLine());
  return summarize(results).FAIL > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    process.stderr.write(`qloo:check failed: ${e instanceof Error ? e.message : "unknown error"}\n`);
    process.exit(1);
  },
);
