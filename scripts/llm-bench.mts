/**
 * LLM latency bake-off. Captures the real LLM requests of a live-Qloo run (scripted LLM, no quota used), then replays
 * them against chosen models and reports latency, JSON validity and grounding.
 *
 *   npm run bench:llm -- capture --dir=<scratch dir>
 *   npm run bench:llm -- run --dir=<scratch dir> --model=groq:openai/gpt-oss-120b --kind=seeds|synthesis|critic|baseline [--n=3] [--gap=20]
 *
 * The capture file holds Qloo response data: point --dir at a scratch directory, never at the repo.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateBrief } from "../src/lib/agent";
import { BriefDraftSchema } from "../src/lib/agent/brief";
import { SeedPlanSchema, stripNulls } from "../src/lib/agent/pipeline/seeds";
import { paletteProblem } from "../src/lib/agent/palette";
import { validateBrief } from "../src/lib/agent/validator";
import { createGeminiProvider } from "../src/lib/llm/gemini";
import { createGroqProvider } from "../src/lib/llm/groq";
import { createScriptedLlm, type JsonRequest, type LlmProvider } from "../src/lib/llm";
import { createQlooClientFromEnv } from "../src/lib/qloo";
import { SHOWCASES } from "../src/lib/showcase";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const arg = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = (line: string): void => void process.stdout.write(`${line}\n`);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const dir = arg("dir") ?? "";

const PLANS: Record<string, unknown> = {
  "cafe-indore": { seeds: [], tags: ["slow living", "young professionals", "great coffee"], musicTags: ["indie rock", "indie folk"], venue: "cafe" },
  "ceramic-artist": {
    seeds: [{ name: "Muji", kind: "brand" }, { name: "Heath Ceramics", kind: "brand" }],
    tags: ["japanese ceramics", "handmade tableware", "wabi-sabi", "slow living", "minimalist home"],
    musicTags: ["ambient", "neo classical", "lo-fi"],
  },
};

const kindOf = (system: string): string =>
  system.startsWith("You extract") ? "seeds" : system.startsWith("You are TasteForge") ? "synthesis" : /critic|coverage/i.test(system.slice(0, 200)) ? "critic" : "baseline";

async function capture(): Promise<void> {
  mkdirSync(dir, { recursive: true });
  const seen: Record<string, JsonRequest & { id: string }> = {};
  const ledgers: Record<string, unknown> = {};
  const qloo = createQlooClientFromEnv();
  for (const def of SHOWCASES.filter((d) => PLANS[d.id])) {
    const scripted = createScriptedLlm();
    const llm: LlmProvider = {
      name: "capture",
      chatJson: (req) => {
        seen[`${kindOf(req.system)}:${def.id}`] = { ...req, id: def.id };
        return kindOf(req.system) === "seeds" ? Promise.resolve(PLANS[def.id]) : scripted.chatJson(req);
      },
    };
    const r = await generateBrief({ prompt: def.prompt, mode: def.mode, city: def.city, llm, qloo, allowNeedsInput: false });
    ledgers[def.id] = r.ledger;
    out(`captured ${def.id}: ok=${r.ok}`);
  }
  writeFileSync(join(dir, "capture.json"), JSON.stringify({ seen, ledgers }));
  out(`kinds: ${Object.keys(seen).join(", ")}`);
}

function provider(spec: string): LlmProvider {
  const i = spec.indexOf(":");
  const kind = spec.slice(0, i);
  const model = spec.slice(i + 1);
  if (kind === "gemini") return createGeminiProvider({ apiKey: process.env.GEMINI_API_KEY as string, model });
  return createGroqProvider({ apiKey: process.env.GROQ_API_KEY as string, model });
}

async function run(): Promise<void> {
  const spec = arg("model") ?? "";
  const kind = arg("kind") ?? "seeds";
  const n = Number(arg("n") ?? 3);
  const gap = Number(arg("gap") ?? 0) * 1000;
  const { seen, ledgers } = JSON.parse(readFileSync(join(dir, "capture.json"), "utf8")) as { seen: Record<string, JsonRequest & { id: string }>; ledgers: Record<string, never> };
  const keys = Object.keys(seen).filter((k) => k.startsWith(`${kind}:`));
  const llm = provider(spec);
  const times: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const key = keys[i % keys.length];
    const req = seen[key];
    const t0 = Date.now();
    try {
      const raw = await llm.chatJson(req);
      const ms = Date.now() - t0;
      times.push(ms);
      let note = "";
      if (kind === "seeds") {
        const p = SeedPlanSchema.safeParse(stripNulls(raw));
        note = p.success ? `valid seeds=${p.data.seeds.length} tags=${p.data.tags.length}: ${p.data.tags.join("|")}` : "INVALID";
      } else if (kind === "synthesis") {
        const p = BriefDraftSchema.safeParse(stripNulls(raw));
        if (!p.success) note = `INVALID ${p.error.issues.slice(0, 2).map((x) => x.path.join(".") + ":" + x.message).join("; ")}`;
        else {
          const v = validateBrief(p.data, "know_audience", ledgers[req.id]);
          const pal = p.data.aesthetic.palette;
          note = `valid grounding=${v.brief.groundingScore} dropped=${v.dropped.length} palette=${pal.map((s) => `${s.label}${s.hex}[${(s.tags ?? []).join("/")}]`).join(",")} palProblem=${paletteProblem(pal) ?? "none"} places=${p.data.aesthetic.referencePlaces.length} artists=${p.data.sound.artists.length} chars=${JSON.stringify(raw).length}`;
        }
      } else note = `keys=${Object.keys(raw as object).join(",")} sizes=${Object.values(raw as object).map((v) => (Array.isArray(v) ? v.length : typeof v)).join("/")}`;
      out(`${spec} ${kind} ${key} ${(ms / 1000).toFixed(1)}s ${note}`);
    } catch (e) {
      const err = e as { kind?: string; status?: number; message?: string };
      out(`${spec} ${kind} ${key} FAIL ${err.kind} ${err.status} ${err.message}`);
    }
    if (gap && i < n - 1) await sleep(gap);
  }
  if (times.length) out(`${spec} ${kind}: median ${(times.sort((a, b) => a - b)[Math.floor(times.length / 2)] / 1000).toFixed(1)}s of ${times.length}`);
}

(process.argv[2] === "capture" ? capture() : run()).then(
  () => process.exit(0),
  (e: unknown) => {
    process.stderr.write(`bench failed: ${e instanceof Error ? e.message : "unknown"}\n`);
    process.exit(1);
  },
);
