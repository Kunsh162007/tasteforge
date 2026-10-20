import { z } from "zod";
import { MAX_CITY_CHARS, MAX_PROMPT_CHARS, MIN_PROMPT_CHARS } from "../request";
import { RequestSignaturesSchema, SignalsSchema } from "../refine/request";
import type { BriefSignals } from "../events";

/** POST /api/brief/compare: rerun a finished brief's pipeline for a second city. */

export const MAX_COMPARE_BODY_CHARS = 6_000;

export const CompareRequestSchema = z.object({
  prompt: z.string().trim().min(MIN_PROMPT_CHARS).max(MAX_PROMPT_CHARS),
  mode: z.enum(["know_audience", "find_audience"]),
  city: z.string().trim().min(2).max(MAX_CITY_CHARS),
  /** The first run's resolved taste signals; when present, extraction and resolution are skipped. */
  signals: SignalsSchema.optional(),
  signatures: RequestSignaturesSchema.optional(),
});

export type CompareRequest = Omit<z.infer<typeof CompareRequestSchema>, "signals"> & { signals?: BriefSignals };

export type ParsedCompare = { ok: true; value: CompareRequest } | { ok: false; message: string };

/** Validates the body; messages are user-safe and never echo the input. */
export function parseCompareRequest(body: unknown): ParsedCompare {
  const parsed = CompareRequestSchema.safeParse(body);
  if (parsed.success) return { ok: true, value: parsed.data };
  const field = String(parsed.error.issues[0]?.path[0] ?? "request");
  const limits: Record<string, string> = {
    prompt: `prompt must be ${MIN_PROMPT_CHARS}-${MAX_PROMPT_CHARS} characters`,
    mode: 'mode must be "know_audience" or "find_audience"',
    city: `city is required and must be 2-${MAX_CITY_CHARS} characters`,
    signals: "signals are invalid",
    signatures: "signatures are invalid",
  };
  return { ok: false, message: limits[field] ?? "Invalid request body." };
}
