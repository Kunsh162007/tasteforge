/**
 * Prompt-size report: live Qloo (from the environment) + a scripted LLM that records what each model call would be sent.
 * Runs the 3 showcase prompts and prints, per call type, the characters and estimated tokens of system prompt, schema
 * and user prompt (the form Groq receives, including the compact prompt it falls back to). No LLM quota is used.
 *
 *   npm run prompt:size
 *
 * Loads .env.local without printing any values.
 */
import { existsSync } from "node:fs";
import { generateBrief } from "../src/lib/agent";
import { createScriptedLlm, type JsonRequest, type LlmProvider } from "../src/lib/llm";
import { createQlooClientFromEnv } from "../src/lib/qloo";
import { SHOWCASES } from "../src/lib/showcase";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const CHARS_PER_TOKEN = 3.3;
const GROQ_PROMPT_TOKEN_BUDGET = 5_500;
const out = (line: string): void => void process.stdout.write(`${line}\n`);
const tokens = (chars: number): number => Math.round(chars / CHARS_PER_TOKEN);

const PLANS: Record<string, unknown> = {
  "cafe-indore": { seeds: [], tags: ["slow living", "young professionals", "great coffee"], musicTags: ["indie rock", "indie folk"], venue: "cafe" },
  "ceramic-artist": {
    seeds: [{ name: "Muji", kind: "brand" }, { name: "Heath Ceramics", kind: "brand" }],
    tags: ["japanese ceramics", "handmade tableware", "wabi-sabi", "slow living", "minimalist home"],
    musicTags: ["ambient", "neo classical", "lo-fi"],
  },
  "couple-night-out": { seeds: [{ name: "Radiohead", kind: "artist" }, { name: "A24", kind: "brand" }], tags: ["vietnamese food", "date night"], musicTags: ["alternative rock"], venue: "restaurant" },
};

type Sent = { readonly kind: string; readonly chars: number; readonly compact: boolean };

const kindOf = (system: string): string =>
  system.startsWith("You extract") ? "seeds" : system.includes("critic") ? "critic" : system.includes("cultural briefing writer") ? "synthesis" : "baseline";

function sizeOf(req: JsonRequest): Sent {
  const fixed = req.system.length + (req.schema ? JSON.stringify(req.schema).length + 90 : 0);
  const full = fixed + req.prompt.length;
  const useCompact = Boolean(req.compactPrompt) && full / CHARS_PER_TOKEN > GROQ_PROMPT_TOKEN_BUDGET;
  return { kind: kindOf(req.system), chars: fixed + (useCompact ? (req.compactPrompt as string).length : req.prompt.length), compact: useCompact };
}

async function main(): Promise<void> {
  const scripted = createScriptedLlm();
  const qloo = createQlooClientFromEnv();
  const totals = new Map<string, number>();
  for (const def of SHOWCASES.slice(0, 3)) {
    const sent: Sent[] = [];
    const llm: LlmProvider = {
      name: scripted.name,
      chatJson: (req) => {
        sent.push(sizeOf(req));
        const plan = req.system.startsWith("You extract") ? PLANS[def.id] : undefined;
        return plan ? Promise.resolve(plan) : scripted.chatJson(req);
      },
    };
    await generateBrief({ prompt: def.prompt, mode: def.mode, city: def.city, llm, qloo, allowNeedsInput: false, withProof: true });
    const total = sent.reduce((n, s) => n + s.chars, 0);
    out(`${def.id}: ${sent.map((s) => `${s.kind}${s.compact ? "(compact)" : ""} ${tokens(s.chars)}`).join(", ")} | input tokens ~${tokens(total)}`);
    totals.set("all", (totals.get("all") ?? 0) + total);
    sent.forEach((s) => totals.set(s.kind, (totals.get(s.kind) ?? 0) + s.chars));
  }
  out(`mean input tokens per brief: ${[...totals].map(([k, v]) => `${k} ${tokens(v / 3)}`).join(", ")}`);
}

main().then(
  () => undefined,
  (e: unknown) => {
    process.stderr.write(`prompt-size failed: ${e instanceof Error ? e.message : "unknown error"}\n`);
    process.exitCode = 1;
  },
);
