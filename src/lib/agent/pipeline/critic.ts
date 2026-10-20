import { z } from "zod";
import type { JsonObject, LlmProvider } from "@/lib/llm";
import type { SectionKey } from "../events";
import { toToolParameters } from "../toolSchemas";
import { noteFallback, snapshotStats, viaTool, type PipelineCtx, type SectionStat } from "./context";
import type { Signals } from "./resolve";
import { stripNulls } from "./seeds";
import { signalArgsFor, type SignalKind } from "./routing";

/** Stage 4: a light-model critic that may request a few allowed follow-up queries (max 2 rounds). */

export const MAX_CRITIC_ROUNDS = 1;
const MAX_FOLLOW_UPS_PER_ROUND = 3;
/** A section with fewer returned items than this counts as thin coverage. */
export const MIN_SECTION_ITEMS = 3;
const WIDE_TAKE = 20;
const DEFAULT_TAKE = 10;

const SECTIONS = ["audience", "aesthetic", "sound", "pairings", "where"] as const;

export const FollowUpSchema = z.object({
  section: z.enum(SECTIONS).describe("Brief section the extra data is for."),
  type: z.enum(["artist", "place", "brand", "movie", "tv_show"]).describe("Entity type to query."),
  strategy: z
    .enum(["drop_location", "tags_only", "entities_only", "more_results"])
    .describe("drop_location: ignore the city. tags_only / entities_only: change the taste signal. more_results: ask for more."),
  reason: z.string().max(160).optional(),
});

export const CriticReplySchema = z.object({
  followUps: z.array(FollowUpSchema).max(MAX_FOLLOW_UPS_PER_ROUND).describe("Empty when coverage is good enough."),
});

export type FollowUp = z.infer<typeof FollowUpSchema>;

const SYSTEM = `You are the critic of a taste-graph research run. You see how much data each brief section got from Qloo.
Pick at most ${MAX_FOLLOW_UPS_PER_ROUND} follow-up Qloo insight queries that would most improve thin sections, using only the allowed strategies:
- drop_location: query without the city filter (when a place query came back empty or thin)
- tags_only: use only concept tags as the signal (when seed entities produced little)
- entities_only: use only seed entities as the signal
- more_results: same query, more results
Do not repeat a follow-up already tried. Return an empty list when nothing would help. Reply with JSON only.`;

export function isWeak(stat: SectionStat | undefined): boolean {
  return !stat || stat.usable === 0 || stat.items < MIN_SECTION_ITEMS;
}

export function weakSections(
  stats: ReadonlyMap<SectionKey, SectionStat>,
  expected: readonly SectionKey[],
): SectionKey[] {
  return expected.filter((s) => isWeak(stats.get(s)));
}

const followUpKey = (f: FollowUp): string => `${f.section}|${f.type}|${f.strategy}`;

function describeStats(stats: ReadonlyMap<SectionKey, SectionStat>, expected: readonly SectionKey[]): string {
  return expected
    .map((s) => {
      const st = stats.get(s);
      return `- ${s}: ${st ? `${st.usable}/${st.calls} calls usable, ${st.items} items, ${st.failed} failed` : "no data"}`;
    })
    .join("\n");
}

/** Keeps only valid, untried follow-ups; anything off-menu is silently dropped. */
export function parseFollowUps(raw: unknown, tried: ReadonlySet<string>): FollowUp[] {
  const list = (stripNulls(raw) as { followUps?: unknown })?.followUps;
  if (!Array.isArray(list)) return [];
  const out: FollowUp[] = [];
  for (const entry of list) {
    const parsed = FollowUpSchema.safeParse(entry);
    if (!parsed.success) continue;
    const key = followUpKey(parsed.data);
    if (tried.has(key) || out.some((f) => followUpKey(f) === key)) continue;
    out.push(parsed.data);
    if (out.length === MAX_FOLLOW_UPS_PER_ROUND) break;
  }
  return out;
}

const KIND_OF: Readonly<Record<FollowUp["type"], SignalKind>> = { artist: "artist", place: "place", brand: "brand", movie: "movie", tv_show: "tv_show" };

function followUpArgs(f: FollowUp, signals: Signals, city: string | undefined): Record<string, unknown> | undefined {
  const sig = signalArgsFor(KIND_OF[f.type], signals);
  const base = { type: f.type, take: f.strategy === "more_results" ? WIDE_TAKE : DEFAULT_TAKE };
  const withCity = f.type === "place" && city && f.strategy !== "drop_location" ? { location: city } : {};
  if (f.strategy === "tags_only") return sig.tag_ids ? { ...base, ...withCity, tag_ids: sig.tag_ids } : undefined;
  if (f.strategy === "entities_only") return sig.entity_ids ? { ...base, ...withCity, entity_ids: sig.entity_ids } : undefined;
  return { ...base, ...withCity, ...sig };
}

async function applyFollowUp(ctx: PipelineCtx, f: FollowUp, signals: Signals, city: string | undefined): Promise<void> {
  const args = followUpArgs(f, signals, city);
  if (!args) return;
  if (f.strategy !== "more_results") noteFallback(ctx, f.section, f.strategy);
  await viaTool(ctx, f.section, "qloo_insights", args);
}

export type CriticOutcome = {
  readonly rounds: number;
  readonly followUps: number;
  /** Short human note for the stage event. */
  readonly detail: string;
};

export type CriticInput = {
  readonly llm: LlmProvider;
  readonly signals: Signals;
  readonly city?: string;
  readonly expected: readonly SectionKey[];
};

/**
 * Looks at section coverage and runs allowed follow-ups. The model call is skipped when coverage is
 * already fine, and a failing critic never fails the run.
 */
export async function runCritic(ctx: PipelineCtx, input: CriticInput): Promise<CriticOutcome> {
  const tried = new Set<string>();
  let followUps = 0;
  let rounds = 0;
  for (let round = 0; round < MAX_CRITIC_ROUNDS; round += 1) {
    const stats = snapshotStats(ctx);
    const weak = weakSections(stats, input.expected);
    if (weak.length === 0) break;
    let reply: unknown;
    try {
      reply = await input.llm.chatJson({
        system: SYSTEM,
        prompt: [
          `City: ${input.city ?? "none"}`,
          `Seed entities: ${input.signals.entityNames.join(", ") || "none"}`,
          `Concept tags: ${input.signals.tagNames.join(", ") || "none"}`,
          `Coverage:\n${describeStats(stats, input.expected)}`,
          `Weak sections: ${weak.join(", ")}`,
          ...(ctx.guard.current.removed.offCity > 0
            ? [`${ctx.guard.current.removed.offCity} place results were removed for lying outside ${input.city ?? "the city"}: prefer more_results (same city) over drop_location for places.`]
            : []),
          `Already tried: ${[...tried].join("; ") || "nothing"}`,
        ].join("\n"),
        schema: toToolParameters(CriticReplySchema) as JsonObject,
        tier: "light",
      });
    } catch {
      return { rounds, followUps, detail: "critic unavailable, kept the first pass" };
    }
    const chosen = parseFollowUps(reply, tried);
    if (chosen.length === 0) break;
    rounds += 1;
    chosen.forEach((f) => tried.add(followUpKey(f)));
    await Promise.all(chosen.map((f) => applyFollowUp(ctx, f, input.signals, input.city)));
    followUps += chosen.length;
  }
  // Wrong-city places were removed and the places section is still thin: widen in the same city, whatever the critic said.
  const widen: FollowUp = { section: "aesthetic", type: "place", strategy: "more_results" };
  const wrongCity = ctx.guard.current.removed.offCity > 0 && Boolean(input.city);
  if (wrongCity && input.expected.includes("aesthetic") && isWeak(snapshotStats(ctx).get("aesthetic")) && !tried.has(followUpKey(widen))) {
    await applyFollowUp(ctx, widen, input.signals, input.city);
    followUps += 1;
  }
  const detail = followUps === 0 ? "coverage looks good" : `${followUps} follow-up quer${followUps === 1 ? "y" : "ies"} in ${rounds} round${rounds === 1 ? "" : "s"}`;
  return { rounds, followUps, detail };
}
