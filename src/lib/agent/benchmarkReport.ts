import {
  BENCH_KINDS,
  classifyMiss,
  missBreakdown,
  summarizeByKind,
  type Audit,
  type BenchKind,
  type KindSummary,
  type MissClass,
  type PickOutcome,
} from "./benchmark";

/** Renders docs/BENCHMARK.md from benchmark results (aggregates, pick names and classes; never raw Qloo data). */

export type BenchRun = {
  readonly id: string;
  readonly city: string;
  readonly type: string;
  readonly seconds: number;
  readonly grounding: number;
  readonly baseline: readonly PickOutcome[];
  readonly tasteforge: readonly PickOutcome[];
};

export type Consistency = {
  readonly id: string;
  readonly baselineOverlap: number | null;
  readonly tasteforgeOverlap: number | null;
  readonly groundings: readonly [number, number];
  /** Picks in each of the two TasteForge briefs (a run whose Qloo walk came back thin has few). */
  readonly picks: readonly [number, number];
};

export type BenchPrompt = { readonly id: string; readonly city: string; readonly type: string; readonly mode: string; readonly prompt: string };

export type BenchReport = {
  readonly runs: readonly BenchRun[];
  readonly consistency: readonly Consistency[];
  readonly prompts: readonly BenchPrompt[];
  readonly models: readonly string[];
  readonly date: string;
  readonly llmCalls: number;
  /** Hand audit of the picks that could not be verified (scripts/benchmark-audit.json). */
  readonly audit?: Audit;
  /** A repeat-run consistency section and headline bullet from an earlier run, kept as they were when those runs are not repeated. */
  readonly keptConsistency?: { readonly section: string; readonly bullet: string };
};

/** Pulls the consistency section and its headline bullet out of an existing BENCHMARK.md (undefined when it has none). */
export function extractConsistency(md: string): { section: string; bullet: string } | undefined {
  const start = md.indexOf("## Repeat-run consistency");
  const end = md.indexOf("\n## Method");
  const bullet = /^- \*\*Repeat-run consistency\*\*.*$/m.exec(md)?.[0];
  if (start < 0 || end < 0 || !bullet) return undefined;
  return { section: md.slice(start, end).trimEnd(), bullet };
}

const pct = (n: number | null): string => (n === null ? "n/a" : `${Math.round(n * 100)}%`);
const fit = (n: number | null): string => (n === null ? "n/a" : n.toFixed(2));
const KIND_LABEL: Record<BenchKind, string> = { artist: "Artists", place: "Places", brand: "Brands" };
const CLASS_LABEL: Record<MissClass, string> = {
  likely_invented: "(a) Likely invented: no evidence it exists",
  real_not_in_qloo: "(b) Real, but not in Qloo's data",
  wrong_type: "(b) Qloo lists the name under another type (mostly real people and companies)",
  real_other_city: "(c) Qloo lists a place of that name only in another city (may be a namesake)",
  unclassified: "Not classified (no audit entry)",
};

function kindRows(base: Record<BenchKind, KindSummary>, mine: Record<BenchKind, KindSummary>): string[] {
  return BENCH_KINDS.map((k) => {
    const b = base[k];
    const t = mine[k];
    return `| ${KIND_LABEL[k]} | ${b.picks} / ${t.picks} | ${b.verified} | ${b.unverified} | ${b.wrongType} | ${k === "place" ? b.otherCity : "n/a"} | ${pct(b.couldntVerifyRate)} | ${pct(t.couldntVerifyRate)} |`;
  });
}

const sum = (s: Record<BenchKind, KindSummary>, f: (k: KindSummary) => number): number => BENCH_KINDS.reduce((n, k) => n + f(s[k]), 0);

function headline(base: Record<BenchKind, KindSummary>, mine: Record<BenchKind, KindSummary>, breakdown: Record<MissClass, number>): string {
  const picks = sum(base, (k) => k.picks);
  const miss = sum(base, (k) => k.couldntVerify);
  const myPicks = sum(mine, (k) => k.picks);
  const myMiss = sum(mine, (k) => k.couldntVerify);
  const b = base.place;
  const real = breakdown.real_not_in_qloo + breakdown.wrong_type;
  return [
    `- **Picks Qloo could not verify in the requested city:** ${pct(miss / Math.max(picks, 1))} of the plain LLM's ${picks} picks (artists, places and brands), ${pct(b.couldntVerifyRate)} of its places (${b.couldntVerify} of ${b.picks}). TasteForge: ${pct(myMiss / Math.max(myPicks, 1))} of ${myPicks}, because it only returns what Qloo returned.`,
    `- **What the ${miss} unverified picks are** (hand-audited, see below): ${breakdown.likely_invented} likely invented, ${real} real but missing from Qloo or listed under another type, ${breakdown.real_other_city} with a same-named place only in another city${breakdown.unclassified > 0 ? `, ${breakdown.unclassified} not classified` : ""}. "Couldn't be verified" is the claim; "invented" is not.`,
  ].join("\n");
}

function breakdownTable(b: Record<MissClass, number>): string {
  const total = Object.values(b).reduce((x, y) => x + y, 0);
  return [
    "| Class | Picks | Share of unverified |",
    "|---|---|---|",
    ...(Object.keys(CLASS_LABEL) as MissClass[]).map((c) => `| ${CLASS_LABEL[c]} | ${b[c]} | ${pct(total === 0 ? null : b[c] / total)} |`),
  ].join("\n");
}

export function renderBenchmark(r: BenchReport): string {
  const audit = r.audit ?? {};
  const baseline = r.runs.flatMap((x) => x.baseline);
  const base = summarizeByKind(baseline);
  const mine = summarizeByKind(r.runs.flatMap((x) => x.tasteforge));
  const breakdown = missBreakdown(baseline, audit);
  const cities = [...new Set(r.prompts.map((p) => p.city))];
  const consistencyRows = r.consistency.map(
    (c) => `| ${c.id} | ${pct(c.baselineOverlap)} | ${pct(c.tasteforgeOverlap)} | ${c.picks.join(" and ")} | ${c.groundings.map((g) => pct(g)).join(" and ")} |`,
  );
  const avg = (f: (c: Consistency) => number | null): number | null => {
    const v = r.consistency.flatMap((c) => (f(c) === null ? [] : [f(c) as number]));
    return v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length;
  };
  return `# Verification benchmark

How often can Qloo verify the venues, artists and brands a plain LLM names, in the city the user asked about, and how does TasteForge compare? Generated by \`npm run benchmark\` on ${r.date}; ${r.runs.length} of ${r.prompts.length} prompts completed.

## Headline

${headline(base, mine, breakdown)}
${r.keptConsistency?.bullet ?? `- **Repeat-run consistency** (${r.consistency.length} prompts, 2 runs each): picks overlap ${pct(avg((c) => c.baselineOverlap))} for the plain LLM and ${pct(avg((c) => c.tasteforgeOverlap))} for TasteForge.`}

"Couldn't be verified" means Qloo has no entity of that type with that name in that city. It does not mean the place does not exist: Qloo's catalogue is not the world, and some of these names are real venues, authors or companies that Qloo lists elsewhere or under another type.

## Results (${r.runs.length} prompts, ${cities.length} cities: ${cities.join(", ")})

Baseline = the Taste Proof baseline: a plain LLM with no Qloo data, asked for artists, places and brands for the same prompt. TasteForge = the picks in TasteForge's brief. Each pick is checked against Qloo.

| Pick type | Picks (baseline / TasteForge) | Verified: baseline | Not in Qloo's data | Wrong type | Other city | Couldn't verify: baseline | Couldn't verify: TasteForge |
|---|---|---|---|---|---|---|---|
${kindRows(base, mine).join("\n")}

- **Verified**: Qloo lists an entity of the right type with a matching name. Names are compared after removing accents, "The", punctuation and descriptors such as "Cafe" or "Cocktail Lounge"; each pick is searched across all entity types, with the city added for places and a shortened form tried when the full name finds nothing.
- **Not in Qloo's data**: no entity of any type matches the name.
- **Wrong type**: Qloo lists a same-named person, author, brand or place, but not of the type asked for (an author named as an artist, a museum listed as a brand).
- **Other city** (places only): the matching place closest to the city centre lies more than 50 km from it.
- Fit scores are left out of the headline. Qloo normalizes affinity within each query, so a mean over two different lists says little; as a sanity check, the verified picks of both lists score in the same range (${fit(base.artist.meanFit)} against ${fit(mine.artist.meanFit)} for artists, ${fit(base.place.meanFit)} against ${fit(mine.place.meanFit)} for places, ${fit(base.brand.meanFit)} against ${fit(mine.brand.meanFit)} for brands), which is what you would expect and not a result.

## Classification of the baseline's unverified picks

Every unverified baseline pick was classified by hand (the audit lives in \`scripts/benchmark-audit.json\`: names and classes only). Wrong-type and other-city follow from the Qloo search; the rest were checked against general knowledge and, where cheap, a web search. A pick with no evidence either way stays unclassified.

${breakdownTable(breakdown)}

${perPrompt(r.runs, audit)}

${r.keptConsistency?.section ?? `## Repeat-run consistency

Three prompts, each run twice with the real synthesis step. Overlap is the Jaccard overlap of pick names (1 = identical lists). Every TasteForge brief in these runs was fully grounded; what changes between runs is which questions the language model asks Qloo (its seeds and concept tags) and which of the results it writes up, so the picks differ even though each one is real. Both lists are far from repeatable: the design guarantees grounding, not stability.

| Prompt | Plain LLM overlap | TasteForge overlap | TasteForge picks per run | Citation coverage of the two briefs |
|---|---|---|---|---|
${consistencyRows.join("\n") || "| not run | | | | |"}`}

## Method

- **Prompts:** ${r.prompts.length} prompts across ${cities.length} cities, mixing cafes, shops, studios and events, in both modes (listed below). Cities were chosen from \`npm run qloo:check\`, which shows live place, decor/ambience and heatmap coverage for each.
- **Baseline:** one LLM call asking for about 6 artists, 6 places and 4 brands with no Qloo data (the same call the app's Taste Proof makes). Names the user typed into the prompt are removed from both lists, as in the app.
- **TasteForge:** the full hybrid pipeline against live Qloo. In the ${r.prompts.length}-prompt set the synthesis step is replaced by a deterministic writer, so TasteForge's picks are the Qloo entities the walk returned, in order, capped at the same counts as the baseline. This keeps the free LLM quota usable; the consistency runs use the real synthesis. The real brief can only cite entities from this same evidence, so its unverified rate is the same by construction; its picks can differ.
- **Models (fast chain, all calls):** ${r.models.join(", ")}. Real LLM calls used: ${r.llmCalls}.
- **Scoring (sanity check only):** one \`/v2/insights\` call per pick type with \`filter.results.entities\`, using the same audience signals for both lists.

## Prompts

| Id | Mode | Prompt |
|---|---|---|
${r.prompts.map((p) => `| ${p.id} | ${p.mode} | ${p.prompt} |`).join("\n")}

## Caveats

- Qloo's catalogue is not the world. "Couldn't be verified" overstates fabrication; the classification above is the better reading. Indore has far thinner coverage than London or Chicago, and its place results are the most likely to be missing.
- TasteForge returns only what Qloo returned, so its unverified rate is about 0% by design. That is the point of the architecture, not a measured model skill.
- A name match can be generous: a short chain name can match a branch in another city. Places are judged against the city by distance, which favours the baseline when a namesake is nearby.
- The classification into "likely invented" and "real but missing" is a judgement from general knowledge and a few web searches, not ground truth. Treat the split as indicative.
- The baseline model matters. Here the baseline is the fast chain (mostly Groq gpt-oss-120b, which knows fewer local venues than the large Gemini models). Read the numbers as a measurement of one model on one day, not as a rate for AI assistants in general. TasteForge's 0% does not depend on the baseline model.
- One run of each prompt, 20 prompts, one day: treat percentages as indicative, not as confidence intervals.
- The LLM free tiers change quickly; model names above are what answered on the day.

## Reproduce

\`\`\`bash
# needs QLOO_MODE=live, QLOO_API_KEY and GROQ_API_KEY and/or GEMINI_API_KEY in .env.local
npm run benchmark -- --write
\`\`\`
`;
}

function perPrompt(runs: readonly BenchRun[], audit: Audit): string {
  const lines = runs.flatMap((x) => {
    const bad = x.baseline.filter((p) => p.status !== "verified");
    if (bad.length === 0) return [];
    const names = bad.map((p) => `${p.name} (${p.kind}; ${CLASS_LABEL[classifyMiss(p, audit) ?? "unclassified"].replace(/^\(\w\) /, "")})`).join("; ");
    return [`- **${x.id}**: ${names}`];
  });
  return lines.length === 0 ? "None." : `Per prompt:\n\n${lines.join("\n")}`;
}

const avgOf = (rows: readonly Consistency[], f: (c: Consistency) => number | null): number | null => {
  const v = rows.flatMap((c) => (f(c) === null ? [] : [f(c) as number]));
  return v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length;
};

export function consistencyTable(rows: readonly Consistency[]): string {
  const lines = rows.map((c) => `| ${c.id} | ${pct(c.baselineOverlap)} | ${pct(c.tasteforgeOverlap)} | ${c.picks.join(" and ")} | ${c.groundings.map((g) => pct(g)).join(" and ")} |`);
  return [
    "| Prompt | Plain LLM overlap | TasteForge overlap | TasteForge picks per run | Citation coverage of the two briefs |",
    "|---|---|---|---|---|",
    ...(lines.length > 0 ? lines : ["| not run | | | | |"]),
  ].join("\n");
}

/** The first markdown table at or after `from` in `text`, as a block of lines. */
function tableAfter(text: string, from: number): string {
  const lines = text.slice(from).split("\n");
  const first = lines.findIndex((l) => l.startsWith("|"));
  if (first < 0) return "";
  const block: string[] = [];
  for (const l of lines.slice(first)) {
    if (!l.startsWith("|")) break;
    block.push(l);
  }
  return block.join("\n");
}

export type ConsistencyPatch = {
  readonly date: string;
  /** Prose under the heading: what was measured and how to read it. */
  readonly notes: string;
  /** Label for the numbers being replaced, e.g. "2026-10-20, before the stability changes". */
  readonly beforeLabel: string;
};

/**
 * Replaces the consistency section of an existing BENCHMARK.md with new measurements, keeping the numbers it replaces
 * as a "Before" table (an earlier "Before" table is kept as it is), and updates the headline bullet.
 */
export function patchConsistency(md: string, rows: readonly Consistency[], p: ConsistencyPatch): string {
  const start = md.indexOf("## Repeat-run consistency");
  const end = md.indexOf("\n## Method");
  if (start < 0 || end < 0) throw new Error("BENCHMARK.md has no consistency section to update");
  const old = md.slice(start, end);
  const beforeAt = old.indexOf("### Before");
  const before = beforeAt >= 0 ? tableAfter(old, beforeAt) : tableAfter(old, 0);
  const beforeHeading = beforeAt >= 0 ? (old.slice(beforeAt).split("\n")[0] ?? "### Before") : `### Before (${p.beforeLabel})`;
  const section = `## Repeat-run consistency

${p.notes}

### After (${p.date})

${consistencyTable(rows)}

${beforeHeading}

${before}
`;
  const headline = `- **Repeat-run consistency** (${rows.length} prompts, 2 runs each): picks overlap ${pct(avgOf(rows, (c) => c.baselineOverlap))} for the plain LLM and ${pct(avgOf(rows, (c) => c.tasteforgeOverlap))} for TasteForge.`;
  const replaced = md.slice(0, start) + section + md.slice(end);
  return replaced.replace(/^- \*\*Repeat-run consistency\*\*.*$/m, headline);
}
