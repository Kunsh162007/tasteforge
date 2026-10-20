/**
 * End-to-end smoke test: real LLM (from env) + mock Qloo. Run with `npm run smoke`.
 * Runs the hybrid pipeline plus the Taste Proof and prints LLM call count, duration, grounding and
 * proof averages. Loads .env.local into process.env without printing any values.
 */
import { existsSync } from "node:fs";
import { generateBrief, type AgentEvent } from "../src/lib/agent";
import { createLlm, loadLlmConfig } from "../src/lib/llm";
import { createQlooClient } from "../src/lib/qloo";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PROMPT = "Dream-pop and indie folk fans who love cosy, brick-and-plant cafes. Opening a record-shop cafe.";
const CITY = "Brooklyn";
const out = (line: string): void => void process.stdout.write(`${line}\n`);

function describe(e: AgentEvent): string | undefined {
  switch (e.type) {
    case "stage":
      return `stage  ${e.stage} ${e.status}${e.detail ? ` (${e.detail})` : ""}`;
    case "tool_result":
      return `result ${e.ok ? "ok " : "ERR"} ${e.evidenceId ?? ""} ${e.summary.slice(0, 90)}`;
    case "brief":
      return `brief  "${e.brief.title}" grounding=${e.brief.groundingScore} dropped=${e.dropped.length}`;
    case "proof":
      return `proof  baseline=${e.proof.baselineAvg} tasteforge=${e.proof.tasteforgeAvg} notFound=${e.proof.baselineNotFound}`;
    case "error":
      return `error  ${e.message} (retryable=${e.retryable})`;
    default:
      return undefined;
  }
}

async function main(): Promise<number> {
  const config = loadLlmConfig();
  let httpCalls = 0;
  const countingFetch: typeof fetch = (input, init) => {
    httpCalls += 1;
    return fetch(input, init);
  };
  const llm = createLlm(config, {
    fetchImpl: countingFetch,
    onFallback: (e, from, to) => {
      const { kind, status } = (e ?? {}) as { kind?: string; status?: number };
      out(`fallback ${from} -> ${to}: ${kind ?? "error"} HTTP ${status ?? "-"}`);
    },
  });
  const qloo = createQlooClient({ mode: "mock", baseUrl: "https://hackathon.api.qloo.com" });
  out(`provider=${config.provider} model=${config.geminiModel} light=${config.geminiLightModel} fallback=${config.groqApiKey ? "groq" : "none"}`);
  const started = Date.now();
  const result = await generateBrief({
    prompt: PROMPT,
    mode: "know_audience",
    city: CITY,
    llm,
    qloo,
    allowNeedsInput: false,
    onEvent: (e) => {
      const line = describe(e);
      if (line) out(line);
    },
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  out(`\nok=${result.ok} llm_used=${llm.name} llm_http_calls=${httpCalls} evidence=${result.ledger.records.length} time=${seconds}s`);
  if (result.cause) out(`cause=${result.cause}`);
  if (result.brief) out(`groundingScore=${result.brief.groundingScore} sectionConfidence=${JSON.stringify(result.brief.sectionConfidence)}`);
  if (result.proof) {
    out(`proof baselineAvg=${result.proof.baselineAvg} tasteforgeAvg=${result.proof.tasteforgeAvg} baselineNotFound=${result.proof.baselineNotFound}`);
  }
  return result.ok ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    process.stderr.write(`smoke failed: ${e instanceof Error ? e.message : "unknown error"}\n`);
    process.exit(1);
  },
);
