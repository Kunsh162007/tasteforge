import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { z } from "zod";
import { BriefDraftSchema, type Brief, type BriefMode } from "@/lib/agent/brief";
import type { TasteProof } from "@/lib/agent/events";
import type { Evidence } from "@/lib/agent/ledger";
import { EvidenceSchema } from "@/lib/agent/refine/request";

/**
 * Shareable brief links without a database: the brief, the evidence it cites, the Taste Proof and the
 * request are compressed with lz-string into the URL fragment (`/b#<data>`). Fragments are never sent to
 * the server, so the link stays private to whoever holds it.
 */

/** Longest fragment we will try to decode; keeps a hostile link from expanding into a huge object. */
export const MAX_SHARE_CHARS = 60_000;
const MAX_DECODED_CHARS = 400_000;

export type SharePayload = {
  readonly brief: Brief;
  /** Only the evidence records the brief cites. */
  readonly evidence: readonly Evidence[];
  readonly proof?: TasteProof;
  readonly prompt: string;
  readonly mode: BriefMode;
  readonly city?: string;
  /** Server signatures for `evidence` (evidence id to signature), checked by POST /api/verify. */
  readonly signatures?: Readonly<Record<string, string>>;
};

const ConfidenceSchema = z.enum(["high", "medium", "low"]);

const PickSchema = z.object({
  name: z.string().max(200),
  kind: z.enum(["artist", "place", "brand"]),
  qlooId: z.string().max(160).optional(),
  affinity: z.number().nullable(),
  evidence: z.array(z.string().regex(/^ev_\d{1,4}$/)).max(8).optional(),
  address: z.string().max(200).optional(),
  local: z.boolean().optional(),
  status: z.enum(["verified", "wrong_type", "other_city", "unverified"]).optional(),
  matchedKind: z.string().max(40).optional(),
});

const ProofSchema = z.object({
  baseline: z.array(PickSchema).max(40),
  tasteforge: z.array(PickSchema).max(40),
  baselineAvg: z.number().nullable(),
  tasteforgeAvg: z.number().nullable(),
  baselineNotFound: z.number(),
  city: z.string().max(80).optional(),
});

const PayloadSchema = z.object({
  v: z.literal(1),
  brief: BriefDraftSchema.extend({
    mode: z.enum(["know_audience", "find_audience"]),
    groundingScore: z.number().min(0).max(1),
    model: z.string().max(120).optional(),
    sectionConfidence: z.record(z.string(), ConfidenceSchema).optional(),
  }),
  evidence: z.array(EvidenceSchema).max(120),
  proof: ProofSchema.optional(),
  prompt: z.string().max(1_000),
  mode: z.enum(["know_audience", "find_audience"]),
  city: z.string().max(80).optional(),
  sigs: z.record(z.string().regex(/^ev_\d{1,4}$/), z.string().max(64)).optional(),
});

export type DecodeResult = { readonly ok: true; readonly value: SharePayload } | { readonly ok: false; readonly message: string };

const BAD_LINK = "This share link is damaged or incomplete. Ask the sender to copy the link again.";
const TOO_BIG = "This share link is too large to open.";

/** Evidence rows kept per record. The brief cites records, not rows, so the tail adds bytes but no meaning. */
const MAX_SHARED_ROWS = 8;

/**
 * Qloo ids are long hex strings that do not compress. A read-only view never uses them, so they are dropped:
 * `qlooId` on brief items and proof picks goes away, and evidence rows get short positional ids.
 */
export function slimEvidence(e: Evidence): Evidence {
  return {
    ...e,
    ...(e.entities ? { entities: e.entities.slice(0, MAX_SHARED_ROWS).map((x, i) => ({ ...x, id: String(i) })) } : {}),
    ...(e.tags ? { tags: e.tags.slice(0, MAX_SHARED_ROWS).map((x, i) => ({ ...x, id: String(i) })) } : {}),
  };
}

const dropQlooIds = (key: string, value: unknown): unknown => (key === "qlooId" ? undefined : value);

/** Compresses the payload into a URL-fragment-safe string. */
export function encodeShare(payload: SharePayload): string {
  const { brief, evidence, proof, prompt, mode, city, signatures } = payload;
  const body = { v: 1, brief, evidence: evidence.map(slimEvidence), ...(proof ? { proof } : {}), prompt, mode, ...(city ? { city } : {}), ...(signatures ? { sigs: signatures } : {}) };
  return compressToEncodedURIComponent(JSON.stringify(body, dropQlooIds));
}

/** Reads a fragment back into a validated payload. Never throws. */
export function decodeShare(fragment: string): DecodeResult {
  const data = fragment.trim().replace(/^#/, "");
  if (!data) return { ok: false, message: BAD_LINK };
  if (data.length > MAX_SHARE_CHARS) return { ok: false, message: TOO_BIG };
  let json: string | null;
  try {
    json = decompressFromEncodedURIComponent(data);
  } catch {
    return { ok: false, message: BAD_LINK };
  }
  if (!json || json.length > MAX_DECODED_CHARS) return { ok: false, message: json ? TOO_BIG : BAD_LINK };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, message: BAD_LINK };
  }
  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: BAD_LINK };
  const { v: _v, sigs, ...value } = parsed.data;
  void _v;
  return { ok: true, value: { ...value, ...(sigs ? { signatures: sigs } : {}) } as unknown as SharePayload };
}
