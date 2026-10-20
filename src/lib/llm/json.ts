import { LlmError } from "./types";

const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;

/** Parses a JSON-mode reply, tolerating a markdown fence some models add. Key-free errors only. */
export function parseJsonText(provider: string, text: string | undefined): unknown {
  const raw = (text ?? "").trim();
  if (raw === "") throw new LlmError(provider, "invalid_response", `${provider} returned an empty JSON reply.`);
  const body = FENCE.exec(raw)?.[1] ?? raw;
  try {
    return JSON.parse(body);
  } catch {
    throw new LlmError(provider, "invalid_response", `${provider} returned JSON that could not be parsed.`);
  }
}
