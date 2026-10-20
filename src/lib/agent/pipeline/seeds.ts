import { z } from "zod";
import type { JsonObject, LlmProvider } from "@/lib/llm";
import type { BriefMode } from "../brief";
import { DATA_RULE, fence } from "../fence";
import { toToolParameters, TYPE_URNS } from "../toolSchemas";

const MAX_SEEDS = 6;
const MAX_TAGS = 6;
const MAX_MUSIC_TAGS = 3;
const FALLBACK_TAG_CHARS = 80;

const KINDS: [string, ...string[]] = ["other", ...Object.keys(TYPE_URNS)];

export const SeedPlanSchema = z.object({
  seeds: z
    .array(
      z.object({
        name: z.string().min(1).max(80).describe("Exact name of a real artist, brand, place, film, show..."),
        kind: z.enum(KINDS).describe("Entity type; use other when unsure."),
      }),
    )
    .max(MAX_SEEDS)
    .describe("Named entities the user mentioned. Never invent any."),
  tags: z
    .array(z.string().min(1).max(60))
    .max(MAX_TAGS)
    .describe("Short concept phrases (mood, aesthetic, cuisine, lifestyle, audience type) describing the audience or project. Not music genres, not the venue type."),
  musicTags: z
    .array(z.string().min(1).max(40))
    .max(MAX_MUSIC_TAGS)
    .optional()
    .describe("Music genres or styles the audience likes, e.g. indie rock, dream pop. Empty when music is not part of the request."),
  venue: z
    .string()
    .max(40)
    .optional()
    .describe("The kind of place being opened or planned in one or two words, e.g. cafe, record shop, ramen bar. Omit when there is none."),
  city: z.string().max(80).optional().describe("City named in the request, if any."),
  audienceHints: z.string().max(240).optional().describe("One sentence on who this audience is."),
});

export type SeedPlan = z.infer<typeof SeedPlanSchema>;

const SYSTEM = `You extract taste-graph seeds from a request for a cultural briefing. Reply with JSON only.
- seeds: real named entities the user explicitly mentioned (artists, bands, brands, venues, films, shows, books). Copy names exactly. Never invent or add entities that were not mentioned. Empty when none.
  Exception, only in find_audience mode when the user names none: add up to 4 well-known real brands, artists or films whose fans overlap strongly with the project (for hand-thrown pottery: Muji, Heath Ceramics). Only ones you are certain exist.
- tags: 2 to 6 short concept phrases (moods, aesthetics, cuisines, lifestyle words, audience types) that describe the audience or project, in plain English such as "slow living", "young professionals" or "japanese ceramics". Do not put music genres or the venue type here.
- musicTags: up to 3 music genres or styles the audience likes, as a record store would label them ("indie rock", "dream pop", "jazz"). When the request mentions or clearly implies music; in find_audience mode also infer 1 to 3 genres this audience would listen to; otherwise empty.
- venue: if the request is about opening or running a physical place, its type in one or two words ("cafe", "bookstore", "ramen bar", "record shop"); otherwise omit.
- city: the city named in the request, otherwise omit.
- audienceHints: one short sentence about who this audience is.
${DATA_RULE}`;

const MODE_HINT: Record<BriefMode, string> = {
  know_audience: "The user already knows their audience and names seeds or tastes.",
  find_audience: "The user describes a project; derive tags that capture the audience whose taste fits it (what they buy, wear, eat, listen to, how their spaces look).",
};

/** Removes null values the model sometimes emits for optional fields. */
export function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, stripNulls(v)]),
    );
  }
  return value;
}

/** Plan used when the model's JSON is unusable: search Qloo tags for the request text itself. */
export function fallbackPlan(prompt: string): SeedPlan {
  return { seeds: [], tags: [prompt.trim().slice(0, FALLBACK_TAG_CHARS)] };
}

export type SeedRequest = {
  readonly prompt: string;
  readonly mode: BriefMode;
  readonly city?: string;
};

/** Stage 1: one light-model JSON call. Unusable JSON degrades to a fallback plan; provider errors propagate. */
export async function extractSeeds(llm: LlmProvider, r: SeedRequest): Promise<SeedPlan> {
  const prompt = [`Mode: ${MODE_HINT[r.mode]}`, `Request: ${fence(r.prompt)}`, r.city ? `City: ${fence(r.city)}` : "City: none given"].join("\n");
  const raw = await llm.chatJson({
    system: SYSTEM,
    prompt,
    schema: toToolParameters(SeedPlanSchema) as JsonObject,
    tier: "light",
  });
  const parsed = SeedPlanSchema.safeParse(stripNulls(raw));
  if (!parsed.success) return fallbackPlan(r.prompt);
  return { ...parsed.data, seeds: dedupeSeeds(parsed.data.seeds) };
}

function dedupeSeeds(seeds: SeedPlan["seeds"]): SeedPlan["seeds"] {
  const seen = new Set<string>();
  return seeds.filter((s) => {
    const key = s.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
