/**
 * Load test: fires N concurrent briefs at a running TasteForge and reports, for each, the time to the first event,
 * to the brief, to the end of the stream (the Taste Proof arrives after the brief), the model that wrote it, any
 * "high demand" waits and errors. Every brief uses a different prompt, so the response caches cannot hide the load.
 *
 *   npm run loadtest -- [--url=http://localhost:3000] [--n=4] [--stagger=0]
 *
 * Needs a running server (`npm run build && npm start`). The server makes the real LLM and Qloo calls: N briefs cost
 * roughly N x 4 LLM calls. The server allows MAX_CONCURRENT_BRIEFS (default 4) at once; more are answered with 503.
 */
import type { UiEvent } from "../src/ui/contract";
import { createSseParser } from "../src/ui/sse";

const arg = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = (line: string): void => void process.stdout.write(`${line}\n`);

const DEFAULT_URL = "http://localhost:3000";
const DEFAULT_N = 4;
const REQUEST_TIMEOUT_MS = 180_000;

const PROMPTS: readonly { prompt: string; mode: "know_audience" | "find_audience"; city: string }[] = [
  { prompt: "A specialty tea house for night-shift nurses and students who love lo-fi and quiet corners.", mode: "know_audience", city: "Toronto" },
  { prompt: "I make small-batch hot sauces. Find the audience that would love them and where to reach them.", mode: "find_audience", city: "Austin" },
  { prompt: "An independent bookshop cafe for people who love Murakami, Sofia Coppola films and rainy afternoons.", mode: "know_audience", city: "Melbourne" },
  { prompt: "I design hand-printed linen tote bags. Find the audience that would love them.", mode: "find_audience", city: "Berlin" },
  { prompt: "A rooftop cocktail bar for design-minded couples who love jazz and Wes Anderson films.", mode: "know_audience", city: "Lisbon" },
  { prompt: "A climbing gym cafe for people who love trail running, indie folk and good coffee.", mode: "know_audience", city: "Denver" },
];

type Row = {
  readonly id: number;
  readonly status: number | "network";
  readonly firstEventMs?: number;
  readonly briefMs?: number;
  readonly doneMs?: number;
  readonly model?: string;
  readonly grounding?: number;
  readonly queueWaits: readonly number[];
  readonly errors: readonly string[];
};

type Draft = { -readonly [K in keyof Row]: Row[K] };

async function readStream(res: Response, row: Draft, started: number, queueWaits: number[], errors: string[]): Promise<void> {
  const at = (): number => Date.now() - started;
  const handle = (e: UiEvent): void => {
    row.firstEventMs ??= at();
    if (e.type === "queue") queueWaits.push(e.waitSeconds);
    if (e.type === "error") errors.push(e.message);
    if (e.type === "brief") {
      row.briefMs = at();
      row.model = e.brief.model;
      row.grounding = e.brief.groundingScore;
    }
    if (e.type === "done") row.doneMs = at();
  };
  const parser = createSseParser();
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true })).forEach(handle);
  }
  parser.flush().forEach(handle);
}

async function one(base: string, id: number): Promise<Row> {
  const started = Date.now();
  const row: Draft = { id, status: "network", queueWaits: [], errors: [] };
  const queueWaits: number[] = [];
  const errors: string[] = [];
  try {
    const res = await fetch(`${base}/api/brief`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(PROMPTS[id % PROMPTS.length]),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    row.status = res.status;
    if (res.ok && res.body) await readStream(res, row, started, queueWaits, errors);
    else errors.push(`HTTP ${res.status}`);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "request failed");
  }
  return { ...row, queueWaits, errors };
}

const sec = (ms: number | undefined): string => (ms === undefined ? "-" : `${(ms / 1000).toFixed(1)}s`);
const median = (xs: readonly number[]): number | undefined => (xs.length === 0 ? undefined : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]);

function line(r: Row): string {
  const waits = r.queueWaits.length > 0 ? r.queueWaits.map((w) => `${w}s`).join(",") : "-";
  return `${String(r.id + 1).padEnd(2)} ${String(r.status).padEnd(7)} ${sec(r.firstEventMs).padEnd(7)} ${sec(r.briefMs).padEnd(7)} ${sec(r.doneMs).padEnd(7)} ${(r.model ?? "-").padEnd(29)} ${String(r.grounding ?? "-").padEnd(10)} ${waits.padEnd(11)} ${r.errors.join(" | ") || "-"}`;
}

async function main(): Promise<number> {
  const base = (arg("url") ?? DEFAULT_URL).replace(/\/$/, "");
  const n = Math.max(1, Number(arg("n") ?? DEFAULT_N));
  const stagger = Number(arg("stagger") ?? 0);
  out(`Firing ${n} concurrent briefs at ${base}${stagger > 0 ? ` (${stagger} ms apart)` : ""}`);
  const wall = Date.now();
  const rows = await Promise.all(
    Array.from({ length: n }, async (_, i) => {
      if (stagger > 0) await new Promise((r) => setTimeout(r, i * stagger));
      return one(base, i);
    }),
  );
  out("\n#  status  first   brief   total   model                         grounding  waits       errors");
  rows.forEach((r) => out(line(r)));
  const ok = rows.filter((r) => r.briefMs !== undefined);
  const models = [...new Set(ok.map((r) => r.model ?? "?"))].join(", ") || "-";
  out(
    `\nbriefs ${ok.length}/${n}; time to brief median ${sec(median(ok.map((r) => r.briefMs as number)))}, max ${sec(Math.max(0, ...ok.map((r) => r.briefMs as number)))}; ` +
      `wall clock ${sec(Date.now() - wall)}; runs with errors ${rows.filter((r) => r.errors.length > 0).length}; models ${models}`,
  );
  return ok.length === n ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    process.stderr.write(`loadtest failed: ${e instanceof Error ? e.message : "unknown error"}\n`);
    process.exitCode = 1;
  },
);
