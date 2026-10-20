import { postJson } from "./http";
import { parseJsonText } from "./json";
import { LlmError, type JsonObject, type JsonRequest, type LlmProvider } from "./types";

const PROVIDER = "gemini";
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export type GeminiOptions = {
  readonly apiKey: string;
  readonly model: string;
  /** Cheaper model for seeds / critic / baseline JSON calls; defaults to `model`. */
  readonly lightModel?: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
};

/** Thinking budget (tokens) per tier: none for cheap extraction, a small one for synthesis. */
const THINKING_BUDGET = { light: 0, main: 1024 } as const;
/** Gemini 3.x models take a thinking level instead of a budget (verified live 2026-10-20: a budget of 0 is HTTP 400). */
const THINKING_LEVEL = { light: "minimal", main: "low" } as const;

const thinkingConfig = (model: string, tier: "light" | "main"): JsonObject =>
  /^gemini-3/.test(model) ? { thinkingLevel: THINKING_LEVEL[tier] } : { thinkingBudget: THINKING_BUDGET[tier] };

type Part = JsonObject;

/** The model's visible text (thought parts are dropped). */
function parseText(raw: unknown): string {
  const parts = (raw as { candidates?: { content?: { parts?: Part[] } }[] })?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new LlmError(PROVIDER, "invalid_response", "Gemini returned no candidates.");
  }
  return parts
    .filter((p) => typeof p.text === "string" && p.thought !== true)
    .map((p) => p.text as string)
    .join("")
    .trim();
}

export function createGeminiProvider(o: GeminiOptions): LlmProvider {
  const fetchImpl = o.fetchImpl ?? fetch;
  const call = (model: string, body: JsonObject) =>
    postJson({
      provider: PROVIDER,
      url: `${BASE}/${encodeURIComponent(model)}:generateContent`,
      headers: { "x-goog-api-key": o.apiKey },
      body,
      fetchImpl,
      timeoutMs: o.timeoutMs ?? 60_000,
    });
  return {
    name: PROVIDER,
    async chatJson(req: JsonRequest): Promise<unknown> {
      const tier = req.tier ?? "main";
      const model = tier === "light" ? (o.lightModel ?? o.model) : o.model;
      const body = (m: string): JsonObject => ({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          ...(req.schema ? { responseJsonSchema: req.schema } : {}),
          thinkingConfig: thinkingConfig(m, tier),
        },
      });
      try {
        return parseJsonText(PROVIDER, parseText(await call(model, body(model))));
      } catch (e) {
        // A retired or unavailable light model (HTTP 404) degrades to the main model.
        if (model === o.model || !(e instanceof LlmError) || e.status !== 404) throw e;
        return parseJsonText(PROVIDER, parseText(await call(o.model, body(o.model))));
      }
    },
  };
}
