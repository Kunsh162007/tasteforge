/**
 * Fabrication benchmark (docs/BENCHMARK.md). For 20 prompts across 5 cities it asks a plain LLM (the Taste Proof
 * baseline: no Qloo data) and TasteForge for picks, then checks every pick against Qloo: does it exist, is a
 * place in the requested city, and how well does it fit the audience's taste signals. Then it repeats three
 * prompts twice and reports how much the picks overlap between runs.
 *
 *   npm run benchmark -- [--only=4] [--no-consistency] [--out=<scratch json>] [--write]
 *   npm run benchmark -- --consistency-only [--no-seed-cache] [--consistency=id,id] [--show] [--write]
 *
 * --consistency-only skips the 20-prompt set and repeats the three consistency prompts twice with the real synthesis;
 * with --write it replaces only the consistency section of docs/BENCHMARK.md (the earlier numbers stay as a "Before" table).
 * Seed plans are cached per normalized prompt, like the app does; --no-seed-cache turns that off to measure the model alone.
 *
 * Needs QLOO_MODE=live and at least one LLM key (loaded from .env.local without printing values). Uses the fast
 * LLM chain throughout. In the 20-prompt set the synthesis step is replaced by the scripted writer, so
 * TasteForge's picks are the evidence entities in ledger order; the six consistency runs use the real synthesis.
 * Only aggregates, pick names and per-pick scores are written; raw Qloo responses never are.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { generateBrief, tasteforgePicks, scoreProof, type Brief, type GenerateResult, type Item, type PickRef } from "../src/lib/agent";
import {
  BENCH_KINDS,
  nameVariants,
  overlap,
  resolvePick,
  summarizeByKind,
  type BenchKind,
  type KindSummary,
  type PickOutcome,
  type SearchHit,
} from "../src/lib/agent/benchmark";
import { medianPoint, normalizeName } from "../src/lib/agent/pipeline/guard";
import { fetchBaselineNames } from "../src/lib/agent/proof";
import { createLlm, createScriptedLlm, loadLlmConfig, type LlmProvider } from "../src/lib/llm";
import { createQlooClient, loadQlooConfig, type QlooClient } from "../src/lib/qloo";
import { ENTITY_TYPES, type EntityTypeUrn } from "../src/lib/qloo/types";
import { patchConsistency, renderBenchmark, type BenchRun, type Consistency } from "../src/lib/agent/benchmarkReport";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (process.argv.includes("--no-seed-cache")) process.env.SEED_CACHE = "0";

const arg = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string): boolean => process.argv.includes(`--${name}`);
const out = (line: string): void => void process.stdout.write(`${line}\n`);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Mode = "know_audience" | "find_audience";
type Prompt = { readonly id: string; readonly city: string; readonly type: "cafe" | "shop" | "studio" | "event"; readonly mode: Mode; readonly prompt: string };

const P = (city: string, type: Prompt["type"], mode: Mode, prompt: string): Prompt => ({ id: `${city.toLowerCase()}-${type}`, city, type, mode, prompt });
const PROMPTS: readonly Prompt[] = [
  P("Indore", "cafe", "find_audience", "A specialty coffee cafe for young professionals who like indie folk and slow mornings"),
  P("Indore", "shop", "find_audience", "A small independent bookstore with a reading corner and poetry nights"),
  P("Indore", "studio", "find_audience", "A pottery studio running weekend wheel-throwing classes"),
  P("Indore", "event", "know_audience", "A monthly open-mic and acoustic night for fans of Prateek Kuhad and The Local Train"),
  P("London", "cafe", "know_audience", "A neighbourhood coffee shop for fans of Radiohead and Massive Attack, with vinyl on the wall"),
  P("London", "shop", "find_audience", "A vintage and secondhand clothing boutique for design students"),
  P("London", "studio", "find_audience", "A ceramics studio selling hand-thrown tableware at weekend markets"),
  P("London", "event", "find_audience", "A weekend pop-up supper club with live jazz"),
  P("Brooklyn", "cafe", "find_audience", "A natural-wine bar and cafe with a plant-filled room"),
  P("Brooklyn", "shop", "know_audience", "A record shop for fans of Mitski, Phoebe Bridgers and Big Thief"),
  P("Brooklyn", "studio", "find_audience", "A boutique yoga and pilates studio for creative professionals"),
  P("Brooklyn", "event", "find_audience", "A pop-up film night screening independent cinema in a courtyard"),
  P("Chicago", "cafe", "find_audience", "A bakery cafe known for sourdough and pastries, with a calm cosy room"),
  P("Chicago", "shop", "know_audience", "A streetwear and sneaker shop for fans of Kendrick Lamar and Tyler, the Creator"),
  P("Chicago", "studio", "find_audience", "A letterpress print and graphic design studio"),
  P("Chicago", "event", "find_audience", "A rooftop summer concert series for indie rock fans"),
  P("Paris", "cafe", "find_audience", "A specialty tea salon with minimalist Japanese-inspired design"),
  P("Paris", "shop", "find_audience", "A concept store selling sustainable homeware and slow fashion"),
  P("Paris", "studio", "find_audience", "A small photography studio and darkroom for film photographers"),
  P("Paris", "event", "know_audience", "A jazz and electronic listening-bar night for fans of Nils Frahm and Khruangbin"),
];
const CONSISTENCY_IDS = (arg("consistency")?.split(",") ?? ["indore-cafe", "london-studio", "brooklyn-shop"]) as readonly string[];
const MIN_GAP_MS = 30_000;
const SEARCH_TAKE = 5;
const QLOO_TIMEOUT_MS = 45_000;
const QLOO_HEDGE_MS = 15_000;
const URNS: Record<BenchKind, EntityTypeUrn> = { artist: ENTITY_TYPES.artist, place: ENTITY_TYPES.place, brand: ENTITY_TYPES.brand };

let llmCalls = 0;

function makeLlm(realSynthesis: boolean): LlmProvider {
  const cfg = loadLlmConfig();
  // The fast chain answers every call type here: it is the quickest and spares the Gemini free-tier quota.
  const real = createLlm({ ...cfg, chain: cfg.fastChain }, { cache: false, onCall: () => (llmCalls += 1) });
  if (realSynthesis) return real;
  const scripted = createScriptedLlm();
  return { name: real.name, chatJson: (req) => (req.system.startsWith("You are TasteForge") ? scripted.chatJson(req) : real.chatJson(req)) };
}

async function hitsFor(qloo: QlooClient, kind: BenchKind, name: string): Promise<SearchHit[]> {
  const search = async (query: string): Promise<SearchHit[]> => {
    try {
      const r = await qloo.search({ query, types: [URNS[kind]], take: SEARCH_TAKE });
      return r.data.map((e) => ({ id: e.id, name: e.name, lat: e.location?.latitude, lon: e.location?.longitude }));
    } catch {
      return [];
    }
  };
  // Also search without a ", City" tail: the baseline is given every chance to be found.
  const lists = await Promise.all(nameVariants(name).map(search));
  return lists.flat();
}

async function oneRun(def: Prompt, qloo: QlooClient, llm: LlmProvider, realSynthesis: boolean): Promise<BenchRun & { readonly generate: GenerateResult }> {
  const t0 = Date.now();
  const baselineNames = fetchBaselineNames(llm, { prompt: def.prompt, city: def.city }).catch(() => [] as PickRef[]);
  const generate = await generateBrief({ prompt: def.prompt, mode: def.mode, city: def.city, llm, qloo, allowNeedsInput: false, withProof: false });
  const base = await baselineNames;
  if (!generate.ok || !generate.brief || !generate.signals) throw new Error(`pipeline failed for ${def.id}`);
  const signals = generate.signals;
  const places = generate.ledger.records.flatMap((r) => r.entities ?? []).filter((e) => e.lat !== undefined && e.lon !== undefined);
  const anchor = medianPoint(generate.ledger.records.filter((r) => r.params.type === "place").flatMap((r) => r.entities ?? []), 3);
  // The user's own seeds are input, not recommendations: leave them out of both lists, like the app's proof does.
  const seedIds = new Set(signals.entityIds);
  const seedNames = new Set(signals.entityNames.map(normalizeName));
  const notSeed = (p: PickRef): boolean => !(p.qlooId && seedIds.has(p.qlooId)) && !seedNames.has(normalizeName(p.name));

  const resolved = await Promise.all(
    base.filter(notSeed).map(async (p) => ({ p, r: resolvePick(p.kind, p.name, await hitsFor(qloo, p.kind, p.name), anchor) })),
  );
  const baselineRefs: PickRef[] = resolved.map(({ p, r }) => (r.found && r.qlooId ? { ...p, qlooId: r.qlooId } : p));
  const mine = tasteforgePicks(realSynthesis ? generate.brief : ledgerBrief(generate), generate.ledger).filter(notSeed);
  const proof = await scoreProof({ qloo, signals, baseline: baselineRefs, tasteforge: mine, city: def.city });
  const fit = (list: readonly { name: string; kind: string; affinity: number | null }[] | undefined, name: string, kind: string): number | null =>
    list?.find((x) => x.name === name && x.kind === kind)?.affinity ?? null;

  const baseline: PickOutcome[] = resolved.map(({ p, r }) => ({
    kind: p.kind, name: p.name, found: r.found, ...(r.qlooId ? { qlooId: r.qlooId } : {}), ...(r.offCity !== undefined ? { offCity: r.offCity } : {}),
    affinity: fit(proof?.baseline, p.name, p.kind),
  }));
  const coords = new Map(places.map((e) => [e.id, e]));
  const tasteforge: PickOutcome[] = mine.map((p) => {
    const e = p.kind === "place" && p.qlooId ? coords.get(p.qlooId) : undefined;
    const offCity = e && anchor && e.lat !== undefined && e.lon !== undefined ? resolvePick("place", p.name, [{ id: e.id, name: e.name, lat: e.lat, lon: e.lon }], anchor).offCity : undefined;
    return { kind: p.kind, name: p.name, found: Boolean(p.qlooId), ...(p.qlooId ? { qlooId: p.qlooId } : {}), ...(offCity !== undefined ? { offCity } : {}), affinity: fit(proof?.tasteforge, p.name, p.kind) };
  });
  return { id: def.id, city: def.city, type: def.type, seconds: (Date.now() - t0) / 1000, grounding: generate.brief.groundingScore, baseline, tasteforge, generate };
}

/** TasteForge's picks in the 20-prompt set: the Qloo entities the walk returned for each kind, in ledger order. */
function ledgerBrief(g: GenerateResult): Brief {
  const brief = g.brief as Brief;
  const items = (kind: BenchKind, limit: number): Item[] => {
    const seen = new Set<string>();
    const out: Item[] = [];
    for (const r of g.ledger.records.filter((x) => x.params.type === kind)) {
      for (const e of r.entities ?? []) {
        if (seen.has(e.id) || out.length >= limit) continue;
        seen.add(e.id);
        out.push({ label: e.name, qlooId: e.id, evidence: [r.id] });
      }
    }
    return out;
  };
  return {
    ...brief,
    sound: { ...brief.sound, artists: items("artist", 6) },
    aesthetic: { ...brief.aesthetic, referencePlaces: items("place", 6) },
    pairings: items("brand", 4),
  };
}

const namesOf = (picks: readonly PickOutcome[]): string[] => picks.map((p) => p.name);

async function consistency(defs: readonly Prompt[], qloo: QlooClient, gapMs: number): Promise<Consistency[]> {
  const rows: Consistency[] = [];
  for (const def of defs) {
    const runs: BenchRun[] = [];
    for (let i = 0; i < 2; i += 1) {
      const started = Date.now();
      runs.push(await oneRun(def, qloo, makeLlm(true), true));
      out(`  consistency ${def.id} run ${i + 1}: ${((Date.now() - started) / 1000).toFixed(0)}s grounding=${runs[i].grounding}`);
      if (flag("show")) out(`    picks: ${runs[i].tasteforge.map((p) => `${p.kind[0]}:${p.name}`).join(" | ")}`);
      await sleep(gapMs);
    }
    const [a, b] = runs;
    rows.push({
      id: def.id,
      baselineOverlap: overlap(namesOf(a.baseline), namesOf(b.baseline)),
      tasteforgeOverlap: overlap(namesOf(a.tasteforge), namesOf(b.tasteforge)),
      groundings: [a.grounding, b.grounding],
      picks: [a.tasteforge.length, b.tasteforge.length],
    });
  }
  return rows;
}

function printKind(label: string, s: Record<BenchKind, KindSummary>): void {
  for (const k of BENCH_KINDS) out(`  ${label} ${k}: n=${s[k].picks} notFound=${s[k].notFound} offCity=${s[k].offCity}/${s[k].located} fit=${s[k].meanFit?.toFixed(2) ?? "-"}`);
}

function consistencyNotes(): string {
  const cache = process.env.SEED_CACHE === "0" ? "with the seed cache off (the model alone at temperature 0)" : "with the app's configuration (seed plans cached per normalized prompt, temperature 0, results sorted by affinity then id, the writer told to take entities in ranked order)";
  return `Three prompts, each run twice with the real synthesis step, ${cache}. Overlap is the Jaccard overlap of pick names (1 = identical lists). Every pick is a real Qloo result; what can still change between two runs is Qloo's own answers, which questions the model asks when its seed plan is not cached, and which of the ranked results the writer takes. The plain-LLM baseline is a free-running model call and is not meant to be repeatable.`;
}

async function consistencyOnly(qloo: QlooClient): Promise<void> {
  const cons = await consistency(PROMPTS.filter((p) => CONSISTENCY_IDS.includes(p.id)), qloo, MIN_GAP_MS);
  const pct = (n: number | null): string => (n === null ? "n/a" : `${Math.round(n * 100)}%`);
  for (const c of cons) out(`  ${c.id}: tasteforge overlap=${pct(c.tasteforgeOverlap)} baseline overlap=${pct(c.baselineOverlap)} picks=${c.picks.join("/")} grounding=${c.groundings.join("/")}`);
  if (flag("write")) {
    const path = "docs/BENCHMARK.md";
    const date = new Date().toISOString().slice(0, 10);
    const beforeLabel = "2026-10-20, before the stability changes: writer temperature 0.3, no seed cache, results in Qloo's order, no minimum-content guard";
    writeFileSync(path, patchConsistency(readFileSync(path, "utf8"), cons, { date, notes: consistencyNotes(), beforeLabel }));
  }
  const outPath = arg("out");
  if (outPath) writeFileSync(outPath, JSON.stringify({ consistency: cons, llmCalls }, null, 2));
  out(`LLM calls: ${llmCalls}`);
}

async function main(): Promise<void> {
  // Patient client: the app's 15 s timeout is right for a user waiting, not for a measurement.
  const qloo = createQlooClient({ ...loadQlooConfig(), timeoutMs: QLOO_TIMEOUT_MS, hedgeAfterMs: QLOO_HEDGE_MS });
  if (flag("consistency-only")) return consistencyOnly(qloo);
  const only = Number(arg("only") ?? PROMPTS.length);
  const defs = PROMPTS.slice(0, only);
  // --reuse=<earlier --out json> keeps its 20 runs and redoes only the consistency runs.
  const reuse = arg("reuse");
  const runs: BenchRun[] = reuse ? (JSON.parse(readFileSync(reuse, "utf8")) as { runs: BenchRun[] }).runs : [];
  for (const [i, def] of reuse ? [] : defs.entries()) {
    const started = Date.now();
    try {
      const r = await oneRun(def, qloo, makeLlm(false), false);
      runs.push(r);
      out(`[${i + 1}/${defs.length}] ${def.id} ${r.seconds.toFixed(0)}s baseline=${r.baseline.length} picks, tasteforge=${r.tasteforge.length} picks`);
    } catch (e) {
      out(`[${i + 1}/${defs.length}] ${def.id} FAILED: ${e instanceof Error ? e.message : "error"}`);
    }
    const wait = MIN_GAP_MS - (Date.now() - started);
    if (wait > 0) await sleep(wait); // keeps the per-minute token budget of the free LLM tiers
  }
  const base = runs.flatMap((r) => r.baseline);
  const mine = runs.flatMap((r) => r.tasteforge);
  printKind("baseline", summarizeByKind(base));
  printKind("tasteforge", summarizeByKind(mine));
  const cons = flag("no-consistency") ? [] : await consistency(PROMPTS.filter((p) => CONSISTENCY_IDS.includes(p.id)), qloo, MIN_GAP_MS);
  const detail = { runs, consistency: cons, llmCalls };
  const path = arg("out");
  if (path) writeFileSync(path, JSON.stringify(detail, null, 2));
  const prompts = defs.map((d) => ({ id: d.id, city: d.city, type: d.type, mode: d.mode, prompt: d.prompt }));
  const models = (() => {
    const cfg = loadLlmConfig();
    return cfg.fastChain.map((e) => `${e.provider}:${e.model}`);
  })();
  const md = renderBenchmark({ runs, consistency: cons, prompts, models, date: new Date().toISOString().slice(0, 10), llmCalls });
  if (flag("write")) writeFileSync("docs/BENCHMARK.md", md);
  out(`LLM calls: ${llmCalls}`);
}

main().then(
  () => process.exit(0),
  (e: unknown) => {
    process.stderr.write(`benchmark failed: ${e instanceof Error ? e.message : "unknown error"}\n`);
    process.exit(1);
  },
);
