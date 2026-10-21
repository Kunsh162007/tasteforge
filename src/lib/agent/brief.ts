import { z } from "zod";
import type { SectionConfidence } from "./events";

/**
 * Output contract (docs/IMPLEMENTATION_PLAN.md section 3). `BriefDraftSchema` is what the model
 * submits; `groundingScore` and `mode` are added server-side after validation.
 */

const evidenceIds = z
  .array(z.string())
  .describe("Evidence ids (ev_N) returned by Qloo tool results that support this item. Required.");

export const ItemSchema = z.object({
  label: z.string().min(1).max(120),
  detail: z.string().max(400).optional(),
  evidence: evidenceIds,
  qlooId: z.string().optional().describe("Qloo entity or tag id when the item is a Qloo entity."),
});

/** A palette colour: `label` is a real colour name ("Clay terracotta"); `tags` are the Qloo tags it was derived from. */
export const SwatchSchema = ItemSchema.extend({
  hex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .describe("Hex colour like #A1B2C3 mapped from the cited decor/ambience tags."),
  tags: z.array(z.string().max(60)).max(4).optional().describe("Source Qloo decor or ambience tag names, verbatim."),
  role: z.enum(["base", "accent"]).optional().describe("accent for a colour that contrasts clearly with the neutrals."),
});

const items = z.array(ItemSchema).default([]);

export const BriefDraftSchema = z.object({
  title: z.string().min(1).max(160),
  audienceProfile: z.object({
    summary: z.string().max(1200),
    affinities: items,
    demographics: z.array(ItemSchema).optional(),
  }),
  aesthetic: z.object({
    palette: z.array(SwatchSchema).default([]),
    lighting: items,
    materials: items,
    referencePlaces: items,
  }),
  sound: z.object({ direction: z.string().max(600), artists: items }),
  pairings: items.describe("Menu ideas, merch, brand collaborations."),
  whereTheyAre: z.object({ city: z.string().max(80), hotspots: items }).optional(),
  messaging: z.object({
    tone: z.string().max(400),
    phrases: z.array(z.string().max(160)).default([]),
    evidence: evidenceIds,
  }),
});

export type Item = z.infer<typeof ItemSchema>;
export type Swatch = z.infer<typeof SwatchSchema>;
export type BriefDraft = z.infer<typeof BriefDraftSchema>;
export type BriefMode = "know_audience" | "find_audience";

export type Brief = BriefDraft & {
  readonly mode: BriefMode;
  /** How well-supported each section is (pipeline runs only). */
  readonly sectionConfidence?: SectionConfidence;
  /** 0..1, grounded items divided by submitted items. Computed server-side. */
  readonly groundingScore: number;
  /** The language model that wrote the brief, e.g. "gemini:gemini-3.5-flash-lite"; absent for scripted runs. */
  readonly model?: string;
};

export type DroppedItem = {
  readonly section: string;
  readonly label: string;
  /** not_in_evidence: a menu idea with words that appear nowhere in the Qloo tags or names. */
  readonly reason: "no_evidence" | "unknown_evidence" | "not_in_evidence";
  readonly evidence: readonly string[];
};
