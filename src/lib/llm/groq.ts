import { postJson } from "./http";
import { parseJsonText } from "./json";
import { LlmError, type JsonObject, type JsonRequest, type LlmProvider } from "./types";

const PROVIDER = "groq";
/** verified live 2026-10-20: the free tier rejects (HTTP 413) requests over its 8000-token minute budget; leave room for the reply. */
const MAX_REQUEST_TOKENS = 5_500;
const CHARS_PER_TOKEN = 3.3;

/** The compact prompt, when there is one and the full request would not fit the token budget. */
function promptFor(req: JsonRequest): string {
  if (!req.compactPrompt) return req.prompt;
  const size = req.system.length + schemaInstruction(req.schema).length + req.prompt.length;
  return size / CHARS_PER_TOKEN > MAX_REQUEST_TOKENS ? req.compactPrompt : req.prompt;
}

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export type GroqOptions = {
  readonly apiKey: string;
  readonly model: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
};

function parseText(raw: unknown): string {
  const message = (raw as { choices?: { message?: Record<string, unknown> }[] })?.choices?.[0]?.message;
  if (!message) throw new LlmError(PROVIDER, "invalid_response", "Groq returned no choices.");
  return typeof message.content === "string" ? message.content.trim() : "";
}

function schemaInstruction(schema: JsonObject | undefined): string {
  return schema ? `

Reply with one JSON object that matches this JSON schema exactly:
${JSON.stringify(schema)}` : "";
}

export function createGroqProvider(o: GroqOptions): LlmProvider {
  const fetchImpl = o.fetchImpl ?? fetch;
  const call = (body: JsonObject) =>
    postJson({
      provider: PROVIDER,
      url: ENDPOINT,
      headers: { authorization: `Bearer ${o.apiKey}` },
      body,
      fetchImpl,
      timeoutMs: o.timeoutMs ?? 60_000,
    });
  return {
    name: PROVIDER,
    async chatJson(req: JsonRequest): Promise<unknown> {
      const body: JsonObject = {
        model: o.model,
        messages: [
          { role: "system", content: `${req.system}${schemaInstruction(req.schema)}` },
          { role: "user", content: promptFor(req) },
        ],
        response_format: { type: "json_object" },
      };
      return parseJsonText(PROVIDER, parseText(await call(body)));
    },
  };
}
