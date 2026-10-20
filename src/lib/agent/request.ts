import { z } from "zod";
import { QLOO_ID_PATTERN } from "@/lib/qloo/ids";
import type { AgentEvent } from "./events";

export const MAX_PROMPT_CHARS = 1_000;
export const MIN_PROMPT_CHARS = 3;
export const MAX_CITY_CHARS = 80;
export const MAX_SELECTIONS = 10;
const MAX_ID_CHARS = 120;

const qlooId = z.string().max(MAX_ID_CHARS).regex(QLOO_ID_PATTERN);

/** Ids the user picked after a needs_input round: plain ids or the option objects the UI echoes back. */
const SelectionSchema = z
  .array(z.union([qlooId, z.object({ qlooId, label: z.string().max(200).optional(), kind: z.string().max(40).optional() })]))
  .max(MAX_SELECTIONS)
  .transform((list) => list.map((s) => (typeof s === "string" ? s : s.qlooId)));

export const BriefRequestSchema = z.object({
  prompt: z.string().trim().min(MIN_PROMPT_CHARS).max(MAX_PROMPT_CHARS),
  mode: z.enum(["know_audience", "find_audience"]),
  city: z.string().trim().max(MAX_CITY_CHARS).optional(),
  selections: SelectionSchema.optional(),
});

export type BriefRequest = z.infer<typeof BriefRequestSchema>;

export type ParsedRequest = { ok: true; value: BriefRequest } | { ok: false; message: string };

/** Validates the POST body; messages are user-safe and never echo the input. */
export function parseBriefRequest(body: unknown): ParsedRequest {
  const parsed = BriefRequestSchema.safeParse(body);
  if (parsed.success) {
    const { city, selections, ...rest } = parsed.data;
    const value = { ...rest, ...(city ? { city } : {}), ...(selections && selections.length > 0 ? { selections } : {}) };
    return { ok: true, value };
  }
  const field = String(parsed.error.issues[0]?.path[0] ?? "request");
  const limits: Record<string, string> = {
    prompt: `prompt must be ${MIN_PROMPT_CHARS}-${MAX_PROMPT_CHARS} characters`,
    mode: 'mode must be "know_audience" or "find_audience"',
    city: `city must be at most ${MAX_CITY_CHARS} characters`,
    selections: `selections must be at most ${MAX_SELECTIONS} Qloo ids`,
  };
  return { ok: false, message: limits[field] ?? "Invalid request body." };
}

/** Encodes one agent event as a Server-Sent Events frame. */
export function toSseFrame(event: AgentEvent | { type: "done"; ok: boolean }): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
