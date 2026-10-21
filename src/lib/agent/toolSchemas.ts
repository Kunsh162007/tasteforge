import { z } from "zod";
import { ENTITY_TYPES, type EntityTypeUrn } from "@/lib/qloo";
import type { JsonObject } from "@/lib/llm";
import { BriefDraftSchema } from "./brief";

/** Short entity type names exposed to the model, mapped to Qloo URNs. */
export const TYPE_URNS = {
  artist: ENTITY_TYPES.artist,
  book: ENTITY_TYPES.book,
  brand: ENTITY_TYPES.brand,
  destination: ENTITY_TYPES.destination,
  movie: ENTITY_TYPES.movie,
  person: ENTITY_TYPES.person,
  place: ENTITY_TYPES.place,
  podcast: ENTITY_TYPES.podcast,
  tv_show: ENTITY_TYPES.tvShow,
  video_game: ENTITY_TYPES.videoGame,
} as const satisfies Record<string, EntityTypeUrn>;

export type TypeName = keyof typeof TYPE_URNS;
const typeName = z.enum(Object.keys(TYPE_URNS) as [TypeName, ...TypeName[]]);

const ids = (what: string) => z.array(z.string().min(1)).max(10).describe(what);
const entityIds = ids("Qloo entity ids (from qloo_search or earlier results).");
const tagIds = ids("Qloo tag ids such as urn:tag:... (from qloo_find_tags or qloo_entity_tags).");
const take = (max: number) => z.number().min(1).max(max).optional().describe(`Max results (<= ${max}).`);

export const SearchArgs = z.object({
  query: z.string().min(1).max(120).describe("Name to resolve, e.g. an artist, brand or place."),
  types: z.array(typeName).max(4).optional(),
  take: take(10),
});

export const FindTagsArgs = z.object({
  query: z.string().min(1).max(120).describe("Concept, genre, mood or style to map to Qloo tags."),
  tag_types: z.array(z.string()).max(5).optional().describe("Optional tag type URN prefixes."),
  take: take(20),
});

export const InsightsArgs = z.object({
  type: typeName.describe("Entity type to recommend."),
  entity_ids: entityIds.optional(),
  tag_ids: tagIds.optional(),
  location: z.string().max(80).optional().describe("City or neighbourhood, e.g. Brooklyn."),
  filter_tag_ids: tagIds.optional().describe("Hard filter: results must have all of these tags."),
  exclude_tag_ids: tagIds.optional(),
  exclude_entity_ids: entityIds.optional().describe("Entity ids that must not appear in the results."),
  price_min: z.number().min(1).max(4).optional(),
  price_max: z.number().min(1).max(4).optional(),
  take: take(20),
});

export const EntityTagsArgs = z.object({
  entity_ids: entityIds.min(1),
  tag_types: z.array(z.string()).max(5).optional().describe("e.g. urn:tag:decor:qloo, urn:tag:ambience:qloo."),
  take: take(20),
});

export const DemographicsArgs = z.object({ entity_ids: entityIds.optional(), tag_ids: tagIds.optional() });

export const HeatmapArgs = z.object({
  location: z.string().min(1).max(80).describe("City to map, e.g. Brooklyn."),
  entity_ids: entityIds.optional(),
  tag_ids: tagIds.optional(),
});

export const TrendingArgs = z.object({
  type: typeName,
  entity_ids: entityIds.min(1).max(3),
  take: take(12),
});

const ALLOWED_KEYS = new Set(["type", "description", "properties", "required", "items", "enum", "minimum", "maximum"]);

/** Reduces a JSON schema to the subset both Gemini and Groq accept. */
export function sanitizeSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "properties") {
      out[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, sanitizeSchema(v)]),
      );
    } else if (ALLOWED_KEYS.has(key)) {
      out[key] = key === "items" ? sanitizeSchema(value) : value;
    }
  }
  return out;
}

export function toToolParameters(schema: z.ZodType): JsonObject {
  return sanitizeSchema(z.toJSONSchema(schema, { io: "input" })) as JsonObject;
}

/** A JSON schema without its `description` texts, for prompts whose system message already explains every field. */
export function stripDescriptions(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripDescriptions);
  if (!node || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([k, v]) => !(k === "description" && typeof v === "string"))
      .map(([k, v]) => [k, stripDescriptions(v)]),
  );
}

export const SubmitBriefArgs = BriefDraftSchema;
