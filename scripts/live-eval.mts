/**
 * Live evaluation driver: real LLM + the Qloo mode from the environment (QLOO_MODE=live uses the real API).
 *
 *   npm run eval:live -- --mode=know_audience --city=Indore --prompt="..." [--out=<json path>]
 *       [--refine] [--compare=London]
 *
 * Prints grounding, section confidence, Taste Proof, LLM call count and duration. `--out` writes the full
 * result (brief, proof, evidence) as JSON: point it at a scratch directory, never at a tracked file, because it
 * contains Qloo response data. Loads .env.local into process.env without printing any values.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { compareBrief, generateBrief, refineBrief, type AgentEvent, type GenerateResult } from "../src/lib/agent";
import { getGeocoder } from "../src/lib/geo/geocoder";
import { createLlm, loadLlmConfig } from "../src/lib/llm";
import { createQlooClientFromEnv } from "../src/lib/qloo";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const t0 = Date.now();
const out = (line: string): void => void process.stdout.write(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${line}\n`);
const arg = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const calls = new Map<string, string>();

function describe(e: AgentEvent): string | undefined {
  switch (e.type) {
    case "stage":
      return `stage  ${e.stage} ${e.status}${e.detail ? ` (${e.detail})` : ""}`;
    case "tool_call":
      calls.set(e.id, `${e.name} ${JSON.stringify(e.args).replace(/[A-F0-9]{8}-[A-F0-9-]{27}/g, "<id>").slice(0, 200)}`);
      return undefined;
    case "tool_result":
      return `result ${e.ok ? "ok " : "ERR"} ${e.durationMs === undefined ? "" : `${(e.durationMs / 1000).toFixed(1)}s `}${e.summary.slice(0, 110)}${e.ok ? "" : `  <= ${calls.get(e.id)}`}`;
    case "error":
      return `error  ${e.message}`;
    default:
      return undefined;
  }
}

function report(label: string, r: GenerateResult, seconds: string, calls: number): void {
  out(`\n== ${label}: ok=${r.ok} time=${seconds}s llm_calls=${calls} evidence=${r.ledger.records.length}`);
  if (r.cause) out(`cause=${r.cause}`);
  if (r.brief) out(`grounding=${r.brief.groundingScore} confidence=${JSON.stringify(r.brief.sectionConfidence)}`);
  if (r.proof) out(`proof baseline=${r.proof.baselineAvg} tasteforge=${r.proof.tasteforgeAvg} baselineNotFound=${r.proof.baselineNotFound}`);
}

async function main(): Promise<number> {
  const prompt = arg("prompt");
  const mode = (arg("mode") ?? "know_audience") as "know_audience" | "find_audience";
  const city = arg("city");
  if (!prompt) throw new Error('--prompt="..." is required');
  let calls = 0;
  const llm = createLlm(loadLlmConfig(), {
    onCall: () => (calls += 1),
    cache: false,
    onFallback: (e, from, to) => {
      const { kind, status } = (e ?? {}) as { kind?: string; status?: number };
      out(`fallback ${from} -> ${to}: ${kind ?? "error"} HTTP ${status ?? "-"}`);
    },
  });
  const qloo = createQlooClientFromEnv();
  const geocode = getGeocoder();
  const onEvent = (e: AgentEvent): void => {
    const line = describe(e);
    if (line) out(line);
  };
  const dump: Record<string, unknown> = {};

  let started = Date.now();
  // --from=<earlier --out file> reuses that run's brief for --refine / --compare instead of generating again.
  const from = arg("from");
  const earlier = from ? (JSON.parse(readFileSync(from, "utf8")).generate as { brief: GenerateResult["brief"]; signals: GenerateResult["signals"]; evidence: GenerateResult["ledger"]["records"] }) : undefined;
  const first: GenerateResult = earlier
    ? { ok: true, brief: earlier.brief, signals: earlier.signals, ledger: { records: earlier.evidence }, dropped: [] }
    : await generateBrief({ prompt, mode, city, llm, qloo, geocode, allowNeedsInput: false, onEvent });
  if (!earlier) {
    report("generate", first, ((Date.now() - started) / 1000).toFixed(1), calls);
    dump.generate = { brief: first.brief, proof: first.proof, signals: first.signals, stats: first.stats && [...first.stats.values()], evidence: first.ledger.records, dropped: first.dropped };
  }
  if (!first.ok || !first.brief) return 1;

  if (flag("refine")) {
    const sound = first.brief.sound.artists;
    const places = first.brief.aesthetic.referencePlaces;
    const disliked = sound.slice(0, 2).map((a) => a.qlooId ?? a.label);
    const liked = places.slice(0, 1).map((p) => p.qlooId ?? p.label);
    out(`\nrefine: dislike ${sound.slice(0, 2).map((a) => a.label).join(", ")}; like ${places.slice(0, 1).map((p) => p.label).join(", ")}`);
    calls = 0;
    started = Date.now();
    const refined = await refineBrief({
      request: { prompt, mode, city, brief: first.brief, evidence: first.ledger.records, signals: first.signals, feedback: { liked, disliked, locked: [] } },
      llm, qloo, geocode, onEvent,
    });
    report("refine", refined, ((Date.now() - started) / 1000).toFixed(1), calls);
    dump.refine = { brief: refined.brief, proof: refined.proof, evidence: refined.ledger.records };
  }

  const other = arg("compare");
  if (other) {
    calls = 0;
    started = Date.now();
    const second = await compareBrief({ request: { prompt, mode, city: other, signals: first.signals }, llm, qloo, geocode, onEvent });
    report(`compare ${other}`, second, ((Date.now() - started) / 1000).toFixed(1), calls);
    dump.compare = { brief: second.brief, evidence: second.ledger.records };
  }

  const file = arg("out");
  if (file) writeFileSync(file, JSON.stringify(dump, null, 1));
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    process.stderr.write(`eval failed: ${e instanceof Error ? e.message : "unknown error"}\n`);
    process.exit(1);
  },
);
