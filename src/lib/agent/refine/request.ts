import { z } from "zod";
import { QLOO_ID_PATTERN } from "@/lib/qloo/ids";
import { BriefDraftSchema } from "../brief";
import type { BriefSignals } from "../events";
import type { Evidence } from "../ledger";

/** POST /api/brief/refine body (docs/IMPLEMENTATION_PLAN.md section 8.5). */

export const MAX_REFINE_BODY_CHARS = 200_000;
const MAX_REF_CHARS = 160;
const MAX_REFS = 60;
const MAX_EVIDENCE = 80;
const MAX_IDS = 12;

const refs = z.array(z.string().min(1).max(MAX_REF_CHARS)).max(MAX_REFS).default([]);

const EvidenceEntitySchema = z.object({
  id: z.string().max(MAX_REF_CHARS),
  name: z.string().max(200),
  affinity: z.number().optional(),
  note: z.string().max(200).optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
});
const EvidenceTagSchema = z.object({ id: z.string().max(MAX_REF_CHARS), name: z.string().max(200), score: z.number().optional() });

export const EvidenceSchema = z.object({
  id: z.string().regex(/^ev_\d{1,4}$/),
  endpoint: z.string().max(80),
  params: z.record(z.string().max(80), z.string().max(600)),
  summary: z.string().max(600),
  entities: z.array(EvidenceEntitySchema).max(30).optional(),
  tags: z.array(EvidenceTagSchema).max(30).optional(),
});

const qlooId = z.string().max(MAX_REF_CHARS).regex(QLOO_ID_PATTERN);
const ids = z.array(qlooId).max(MAX_IDS);

export const SignalsSchema = z.object({
  entityIds: ids,
  tagIds: ids,
  entityNames: z.array(z.string().max(200)).max(MAX_IDS),
  tagNames: z.array(z.string().max(200)).max(MAX_IDS),
});

const MAX_SIG_CHARS = 64;
const signatureMap = z
  .record(z.string().regex(/^ev_\d{1,4}$/), z.string().max(MAX_SIG_CHARS))
  .refine((m) => Object.keys(m).length <= MAX_EVIDENCE, "too many signatures");

/** Signatures the server issued with a brief (see LedgerSignatures); the client echoes the ones it uses. */
export const RequestSignaturesSchema = z.object({
  records: signatureMap.optional(),
  signals: z.string().max(MAX_SIG_CHARS).optional(),
});
export type RequestSignatures = z.infer<typeof RequestSignaturesSchema>;

const ConfidenceSchema = z.enum(["high", "medium", "low"]);

export const FeedbackSchema = z.object({
  /** Qloo id (or label when the item has none) of items to keep and use as extra taste signals. */
  liked: refs,
  /** Qloo id (or label) of items to replace; excluded from the re-walk. */
  disliked: refs,
  /** Item keys ("sound.artists|<ref>") that must stay verbatim. */
  locked: refs,
});

export const RefineRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(1_000),
  mode: z.enum(["know_audience", "find_audience"]),
  city: z.string().trim().max(80).optional(),
  brief: BriefDraftSchema.extend({
    sectionConfidence: z.record(z.string(), ConfidenceSchema).optional(),
  }),
  evidence: z.array(EvidenceSchema).max(MAX_EVIDENCE),
  signals: SignalsSchema.optional(),
  signatures: RequestSignaturesSchema.optional(),
  feedback: FeedbackSchema,
});

export type RefineRequest = Omit<z.infer<typeof RefineRequestSchema>, "signals" | "evidence"> & {
  evidence: readonly Evidence[];
  signals?: BriefSignals;
};
export type Feedback = z.infer<typeof FeedbackSchema>;

export type ParsedRefine = { ok: true; value: RefineRequest } | { ok: false; message: string };

/** Validates the body; messages are user-safe and never echo the input. */
export function parseRefineRequest(body: unknown): ParsedRefine {
  const parsed = RefineRequestSchema.safeParse(body);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "request");
    return { ok: false, message: `Invalid refine request: check "${field}".` };
  }
  const { feedback } = parsed.data;
  if (feedback.liked.length === 0 && feedback.disliked.length === 0) {
    return { ok: false, message: "Mark at least one item as liked or disliked before refining." };
  }
  return { ok: true, value: parsed.data };
}
