import { z } from "zod";
import type { JsonObject, LlmProvider } from "@/lib/llm";
import type { BriefMode } from "../brief";
import { DATA_RULE, fence } from "../fence";
import { createCache, type Cache } from "@/lib/qloo/cache";
import { singleton } from "@/lib/singleton";
import { stripDescriptions, toToolParameters, TYPE_URNS } from "../toolSchemas";

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
- seeds: real named entities the user explicitly mentioned (artists, bands, brands, venues, films, shows, books), copied exactly with their kind (artist, brand, place, movie, ... or other when unsure); never invent any. Only in find_audience mode when the user names none: add up to 4 well-known real brands, artists or films whose fans overlap with the project (hand-thrown pottery: Muji, Heath Ceramics), only ones you are certain exist.
- tags: 2 to 6 short plain-English concept phrases (moods, aesthetics, cuisines, lifestyle words, audience types) such as "slow living", "young professionals", "japanese ceramics". Not music genres, not the venue type.
- musicTags: up to 3 music genres as a record store labels them ("indie rock", "dream pop", "jazz") when the request mentions or implies music; in find_audience mode infer 1 to 3 this audience would play; otherwise empty.
- venue: the kind of physical place being opened or run, in one or two words ("cafe", "record shop", "ramen bar"); otherwise omit.
- city: the city named in the request, otherwise omit.
- audienceHints: one short sentence on who this audience is.
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

/**
 * Words models use for an entity kind that is not on the menu. verified live 2026-10-21: one reply with `"kind": "film"`
 * failed the whole schema, so the run fell back to searching the request text and produced a thin or empty brief.
 */
const KIND_ALIASES: Readonly<Record<string, string>> = {
  film: "movie",
  movies: "movie",
  show: "tv_show",
  tv: "tv_show",
  series: "tv_show",
  band: "artist",
  musician: "artist",
  singer: "artist",
  company: "brand",
  shop: "place",
  venue: "place",
  restaurant: "place",
  cafe: "place",
  game: "video_game",
};

const asText = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t === "" ? undefined : t;
};

const textList = (v: unknown, max: number, chars: number): string[] =>
  Array.isArray(v) ? v.flatMap((x) => asText(x, chars) ?? []).slice(0, max) : [];

function coerceKind(v: unknown): string {
  const k = typeof v === "string" ? v.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  return KINDS.includes(k) ? k : (KIND_ALIASES[k] ?? "other");
}

/**
 * Reads a model reply leniently: a seed with a bad kind keeps its name, a malformed seed is dropped on its own, and
 * lists over their limits are trimmed. undefined when nothing is left to search with.
 */
export function coerceSeedPlan(raw: unknown): SeedPlan | undefined {
  const o = stripNulls(raw) as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return undefined;
  const seeds = (Array.isArray(o.seeds) ? o.seeds : []).flatMap((s): SeedPlan["seeds"] => {
    const name = asText((s as { name?: unknown } | null)?.name, 80);
    return name ? [{ name, kind: coerceKind((s as { kind?: unknown }).kind) }] : [];
  });
  const tags = textList(o.tags, MAX_TAGS, 60);
  if (seeds.length === 0 && tags.length === 0) return undefined;
  const musicTags = textList(o.musicTags, MAX_MUSIC_TAGS, 40);
  const venue = asText(o.venue, 40);
  const city = asText(o.city, 80);
  const audienceHints = asText(o.audienceHints, 240);
  return {
    seeds: dedupeSeeds(seeds.slice(0, MAX_SEEDS)),
    tags,
    ...(musicTags.length > 0 ? { musicTags } : {}),
    ...(venue ? { venue } : {}),
    ...(city ? { city } : {}),
    ...(audienceHints ? { audienceHints } : {}),
  };
}

export type SeedRequest = {
  readonly prompt: string;
  readonly mode: BriefMode;
  readonly city?: string;
};

const normalizeText = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Same request, same seeds: the key ignores case, spacing and punctuation. */
export const seedCacheKey = (r: SeedRequest): string => [r.mode, normalizeText(r.prompt), normalizeText(r.city ?? "")].join("|");

const SEED_CACHE_ENTRIES = 300;
const SEED_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Process-wide cache of seed plans. A repeated request gets the very same seeds, so repeat runs differ only where Qloo or
 * the writer do. `SEED_CACHE=0` turns it off (benchmarks that measure the model's own variance, unit tests).
 */
export const defaultSeedCache = (): Cache<SeedPlan> | undefined =>
  process.env.SEED_CACHE === "0" ? undefined : singleton("seed-plan-cache", () => createCache<SeedPlan>({ maxEntries: SEED_CACHE_ENTRIES, ttlMs: SEED_CACHE_TTL_MS }));

const MAX_SEED_ATTEMPTS = 2;

/**
 * Stage 1: one light-model JSON call (a second one only when the reply has nothing usable). Provider errors propagate;
 * a reply that stays unusable degrades to a fallback plan, which is not cached.
 */
export async function extractSeeds(llm: LlmProvider, r: SeedRequest, cache: Cache<SeedPlan> | undefined = defaultSeedCache()): Promise<SeedPlan> {
  const key = seedCacheKey(r);
  const cached = cache?.get(key);
  if (cached) return cached;
  const prompt = [`Mode: ${MODE_HINT[r.mode]}`, `Request: ${fence(r.prompt)}`, r.city ? `City: ${fence(r.city)}` : "City: none given"].join("\n");
  const schema = stripDescriptions(toToolParameters(SeedPlanSchema)) as JsonObject;
  for (let attempt = 0; attempt < MAX_SEED_ATTEMPTS; attempt += 1) {
    const plan = coerceSeedPlan(await llm.chatJson({ system: SYSTEM, prompt, schema, tier: "light" }));
    if (plan) {
      cache?.set(key, plan);
      return plan;
    }
  }
  return fallbackPlan(r.prompt);
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
