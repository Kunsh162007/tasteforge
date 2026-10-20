/**
 * Timing profile: scripted (mock) LLM + the Qloo mode from the environment (QLOO_MODE=live hits the real API).
 * Runs the 3 showcase prompts, `--runs` times each, with a cold Qloo client per run unless `--warm`.
 *
 *   npm run profile:live -- [--runs=2] [--only=cafe-indore] [--conc=4] [--gap=250] [--warm]
 *
 * Prints per-stage times, the time the brief and the proof arrived, every HTTP call (queue wait excluded) and the
 * number of 429s. No LLM quota is used. Loads .env.local without printing any values.
 */
import { existsSync } from "node:fs";
import { generateBrief, type AgentEvent } from "../src/lib/agent";
import { createScriptedLlm, type LlmProvider } from "../src/lib/llm";
import { createQlooClient, loadQlooConfig, type QlooClient } from "../src/lib/qloo";
import { SHOWCASES } from "../src/lib/showcase";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const arg = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string): boolean => process.argv.includes(`--${name}`);
const out = (line: string): void => void process.stdout.write(`${line}\n`);
const num = (name: string): number | undefined => (arg(name) === undefined ? undefined : Number(arg(name)));

type Http = { readonly label: string; readonly ms: number; readonly status: number | "err"; readonly query?: string };
type RunStat = {
  readonly id: string;
  readonly total: number;
  readonly briefAt: number | undefined;
  readonly proofAt: number | undefined;
  readonly ok: boolean;
  readonly places: number;
  readonly stages: string[];
  readonly http: Http[];
  readonly slow: string[];
};

const label = (url: string): string => {
  const u = new URL(url);
  const p = u.searchParams;
  const type = p.get("filter.type") ?? p.get("signal.interests.tags") ?? "";
  return `${u.pathname}${type ? ` ${type.replace("urn:entity:", "").slice(0, 22)}` : ""}`;
};

function instrumentedClient(http: Http[], warmShared: QlooClient | undefined): QlooClient {
  if (warmShared) return warmShared;
  const cfg = loadQlooConfig();
  const timed: typeof fetch = async (input, init) => {
    const started = Date.now();
    const url = String(input);
    try {
      const res = await fetch(input, init);
      http.push({ label: label(url), ms: Date.now() - started, status: res.status, query: decodeURIComponent(new URL(url).search).slice(0, 300) });
      return res;
    } catch (e) {
      http.push({ label: label(url), ms: Date.now() - started, status: "err", query: decodeURIComponent(new URL(url).search).slice(0, 300) });
      throw e;
    }
  };
  return createQlooClient({ ...cfg, fetchImpl: cfg.mode === "live" ? timed : undefined, maxConcurrent: num("conc"), minGapMs: num("gap") });
}

/** Seed plans a real model produced for the showcase prompts (so the Qloo queries match a real run). */
const PLANS: Record<string, unknown> = {
  "cafe-indore": { seeds: [], tags: ["slow living", "young professionals", "great coffee"], musicTags: ["indie rock", "indie folk"], venue: "cafe" },
  "ceramic-artist": {
    seeds: [{ name: "Muji", kind: "brand" }, { name: "Heath Ceramics", kind: "brand" }],
    tags: ["japanese ceramics", "handmade tableware", "wabi-sabi", "slow living", "minimalist home"],
    musicTags: ["ambient", "neo classical", "lo-fi"],
  },
  "couple-night-out": { seeds: [{ name: "Radiohead", kind: "artist" }, { name: "A24", kind: "brand" }], tags: ["vietnamese food", "date night"], musicTags: ["alternative rock"], venue: "restaurant" },
};

function planLlm(id: string): LlmProvider {
  const scripted = createScriptedLlm();
  const plan = flag("real-plans") ? PLANS[id] : undefined;
  return { name: scripted.name, chatJson: (req) => (plan && req.system.startsWith("You extract") ? Promise.resolve(plan) : scripted.chatJson(req)) };
}

async function runOne(def: (typeof SHOWCASES)[number], warmShared: QlooClient | undefined): Promise<RunStat> {
  const http: Http[] = [];
  const qloo = instrumentedClient(http, warmShared);
  const t0 = Date.now();
  const at = (): number => (Date.now() - t0) / 1000;
  const stages: string[] = [];
  const open = new Map<string, number>();
  const slow: string[] = [];
  let briefAt: number | undefined;
  let proofAt: number | undefined;
  const onEvent = (e: AgentEvent): void => {
    if (e.type === "stage") {
      if (e.status === "start") open.set(e.stage, at());
      else stages.push(`${e.stage} ${(open.get(e.stage) ?? 0).toFixed(1)}-${at().toFixed(1)}`);
    } else if (e.type === "brief") briefAt = at();
    else if (e.type === "proof") proofAt = at();
    else if (e.type === "tool_result" && (e.durationMs ?? 0) > 8000) slow.push(`${e.name} ${((e.durationMs ?? 0) / 1000).toFixed(1)}s ${e.ok ? "" : "ERR"}`);
  };
  const r = await generateBrief({ prompt: def.prompt, mode: def.mode, city: def.city, llm: planLlm(def.id), qloo, allowNeedsInput: false, onEvent });
  const places = r.brief?.aesthetic.referencePlaces.length ?? 0;
  return { id: def.id, total: at(), briefAt, proofAt, ok: r.ok, places, stages, http, slow };
}

function show(i: number, s: RunStat): void {
  const f = (n: number | undefined): string => (n === undefined ? "-" : n.toFixed(1));
  out(`\n== ${s.id} #${i}: total=${f(s.total)}s brief=${f(s.briefAt)}s proof=${f(s.proofAt)}s ok=${s.ok} places=${s.places}`);
  out(`   stages: ${s.stages.join(" | ")}`);
  const bad = s.http.filter((h) => h.status !== 200);
  const sorted = [...s.http].sort((a, b) => b.ms - a.ms).slice(0, 4);
  out(`   http: ${s.http.length} calls, non-200: ${bad.length ? bad.map((h) => `${h.status} ${h.label}`).join("; ") : "none"}`);
  out(`   slowest: ${sorted.map((h) => `${(h.ms / 1000).toFixed(1)}s ${h.label}`).join("; ")}`);
  for (const h of s.http.filter((x) => x.ms > 8000 || x.status === "err")) out(`   SLOW ${(h.ms / 1000).toFixed(1)}s ${h.status} ${h.query}`);
  if (s.slow.length) out(`   slow tool_results (>8s incl. queue): ${s.slow.join("; ")}`);
}

async function main(): Promise<void> {
  const runs = num("runs") ?? 2;
  const only = arg("only");
  const defs = SHOWCASES.filter((d) => !only || d.id === only);
  const shared = flag("warm") ? instrumentedClient([], undefined) : undefined;
  const all: RunStat[] = [];
  for (let i = 1; i <= runs; i += 1) {
    for (const d of defs) {
      const s = await runOne(d, shared);
      all.push(s);
      show(i, s);
    }
  }
  out("\n== summary (total seconds, brief seconds)");
  for (const d of defs) {
    const mine = all.filter((s) => s.id === d.id);
    out(`${d.id}: total ${mine.map((s) => s.total.toFixed(1)).join(", ")}  brief ${mine.map((s) => s.briefAt?.toFixed(1) ?? "-").join(", ")}`);
  }
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    process.stderr.write(`profile failed: ${e instanceof Error ? e.message : "unknown error"}\n`);
    process.exit(1);
  },
);
