import type { z } from "zod";
import type { QlooClient } from "@/lib/qloo";
import type { ToolCall, ToolDefinition } from "@/lib/llm";
import type { BriefDraft } from "./brief";
import { addEvidence, toLlmView, type Evidence, type EvidenceDraft, type Ledger } from "./ledger";
import {
  demographicsDraft,
  entityDraft,
  heatmapDraft,
  tagDraft,
  trendingDraft,
} from "./summaries";
import {
  DemographicsArgs,
  EntityTagsArgs,
  FindTagsArgs,
  HeatmapArgs,
  InsightsArgs,
  SearchArgs,
  SubmitBriefArgs,
  TrendingArgs,
  TYPE_URNS,
  toToolParameters,
} from "./toolSchemas";

export const SUBMIT_BRIEF = "submit_brief";
const MS_PER_DAY = 86_400_000;
/** verified live 2026-10-20: /v2/trending returns nothing for windows shorter than ~173 days. */
const TREND_WINDOW_DAYS = 180;
const DEFAULT_TREND_TAKE = 12;

export type ToolContext = {
  readonly qloo: QlooClient;
  readonly ledger: Ledger;
  readonly now?: () => Date;
};

export type ToolOutcome = {
  readonly ledger: Ledger;
  /** JSON string returned to the model. */
  readonly content: string;
  readonly isError: boolean;
  readonly evidence?: Evidence;
  /** Present only for a schema-valid submit_brief call. */
  readonly brief?: BriefDraft;
  /** The original error of a failed Qloo call, so callers can tell a busy service from a bad request. */
  readonly cause?: unknown;
};

type Base = { endpoint: string; params: Record<string, string> };
type QlooTool<S extends z.ZodType> = {
  readonly name: string;
  readonly description: string;
  readonly schema: S;
  run(args: z.infer<S>, qloo: QlooClient, now: Date): Promise<EvidenceDraft>;
};

/** Flattens tool args to the string map stored on evidence (arrays comma-joined). */
export function stringParams(args: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined) continue;
    out[k] = Array.isArray(v) ? v.join(",") : String(v);
  }
  return out;
}

const urns = (names: readonly (keyof typeof TYPE_URNS)[] | undefined) => names?.map((n) => TYPE_URNS[n]);
const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const base = (endpoint: string, args: Record<string, unknown>): Base => ({ endpoint, params: stringParams(args) });

const QLOO_TOOLS = [
  {
    name: "qloo_search",
    description:
      "Resolve a name (artist, brand, place, movie...) to Qloo entity ids. Call first to turn seeds into ids.",
    schema: SearchArgs,
    async run(a, qloo) {
      const r = await qloo.search({ query: a.query, types: urns(a.types), take: a.take ?? 5 });
      return entityDraft(base("/search", a), r);
    },
  } satisfies QlooTool<typeof SearchArgs>,
  {
    name: "qloo_find_tags",
    description: "Map a concept, genre, mood or style to Qloo tag ids usable as taste signals.",
    schema: FindTagsArgs,
    async run(a, qloo) {
      const r = await qloo.findTags({ query: a.query, tagTypes: a.tag_types, take: a.take ?? 10 });
      return tagDraft(base("/v2/tags", a), r);
    },
  } satisfies QlooTool<typeof FindTagsArgs>,
  {
    name: "qloo_insights",
    description:
      "Recommend entities of one type that this taste signal (entity_ids and/or tag_ids) over-indexes on. Use location for places.",
    schema: InsightsArgs,
    async run(a, qloo) {
      const r = await qloo.insights({
        type: TYPE_URNS[a.type],
        entities: a.entity_ids,
        tags: a.tag_ids,
        locationQuery: a.location,
        filterTags: a.filter_tag_ids,
        excludeTags: a.exclude_tag_ids,
        excludeEntities: a.exclude_entity_ids,
        priceMin: a.price_min,
        priceMax: a.price_max,
        take: a.take ?? 10,
      });
      return entityDraft(base("/v2/insights", a), r);
    },
  } satisfies QlooTool<typeof InsightsArgs>,
  {
    name: "qloo_entity_tags",
    description:
      "List the tags of given entities (e.g. top places) to read decor/ambience/cuisine/genre. Use tag_types urn:tag:decor:qloo and urn:tag:ambience:qloo for aesthetics.",
    schema: EntityTagsArgs,
    async run(a, qloo) {
      const r = await qloo.entityTags({ entities: a.entity_ids, tagTypes: a.tag_types, take: a.take ?? 15 });
      return tagDraft(base("/v2/insights (urn:tag)", a), r);
    },
  } satisfies QlooTool<typeof EntityTagsArgs>,
  {
    name: "qloo_demographics",
    description: "Age and gender skew of the audience for the given entities or tags.",
    schema: DemographicsArgs,
    async run(a, qloo) {
      const r = await qloo.demographics({ entities: a.entity_ids, tags: a.tag_ids });
      return demographicsDraft(base("/v2/insights (urn:demographics)", a), r);
    },
  } satisfies QlooTool<typeof DemographicsArgs>,
  {
    name: "qloo_heatmap",
    description: "Where in a city this taste concentrates (hotspot cells with lat/lon).",
    schema: HeatmapArgs,
    async run(a, qloo) {
      const r = await qloo.heatmap({ locationQuery: a.location, entities: a.entity_ids, tags: a.tag_ids });
      return heatmapDraft(base("/v2/insights (urn:heatmap)", a), r, a.location);
    },
  } satisfies QlooTool<typeof HeatmapArgs>,
  {
    name: "qloo_trending",
    description: "Whether up to 3 entities are rising or falling in popularity (weekly rank over the last six months).",
    schema: TrendingArgs,
    async run(a, qloo, now) {
      const r = await qloo.trending({
        type: TYPE_URNS[a.type],
        entities: a.entity_ids,
        startDate: isoDate(new Date(now.getTime() - TREND_WINDOW_DAYS * MS_PER_DAY)),
        endDate: isoDate(now),
        take: a.take ?? DEFAULT_TREND_TAKE,
      });
      return trendingDraft(base("/v2/trending", a), r);
    },
  } satisfies QlooTool<typeof TrendingArgs>,
] as const;

const SUBMIT_DESCRIPTION =
  "Submit the final cultural brief. Every item must cite evidence ids (ev_N) from tool results; items without valid evidence are removed. Call exactly once, when research is done.";

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  ...QLOO_TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: toToolParameters(t.schema) })),
  { name: SUBMIT_BRIEF, description: SUBMIT_DESCRIPTION, parameters: toToolParameters(SubmitBriefArgs) },
];

const errorOutcome = (ledger: Ledger, message: string): ToolOutcome => ({
  ledger,
  isError: true,
  content: JSON.stringify({ error: message }),
});

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected tool failure.";
}

async function runQlooTool(
  tool: (typeof QLOO_TOOLS)[number],
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const parsed = (tool.schema as z.ZodType).safeParse(rawArgs);
  if (!parsed.success) return errorOutcome(ctx.ledger, `Invalid arguments: ${describeIssues(parsed.error)}`);
  try {
    const now = ctx.now?.() ?? new Date();
    const draft = await (tool.run as (a: unknown, q: QlooClient, n: Date) => Promise<EvidenceDraft>)(
      parsed.data,
      ctx.qloo,
      now,
    );
    const { ledger, evidence } = addEvidence(ctx.ledger, draft);
    return { ledger, evidence, isError: false, content: JSON.stringify(toLlmView(evidence)) };
  } catch (e) {
    return { ...errorOutcome(ctx.ledger, messageOf(e)), cause: e };
  }
}

function runSubmit(rawArgs: unknown, ledger: Ledger): ToolOutcome {
  const parsed = SubmitBriefArgs.safeParse(rawArgs);
  if (!parsed.success) {
    return errorOutcome(ledger, `Brief did not match the schema, fix and call submit_brief again: ${describeIssues(parsed.error)}`);
  }
  return { ledger, isError: false, brief: parsed.data, content: JSON.stringify({ status: "received" }) };
}

/** Validates args at the boundary, runs the tool, and returns the new ledger plus the model-facing result. */
export async function executeTool(call: Pick<ToolCall, "name" | "args">, ctx: ToolContext): Promise<ToolOutcome> {
  if (call.name === SUBMIT_BRIEF) return runSubmit(call.args, ctx.ledger);
  const tool = QLOO_TOOLS.find((t) => t.name === call.name);
  if (!tool) return errorOutcome(ctx.ledger, `Unknown tool "${call.name}".`);
  return runQlooTool(tool, call.args, ctx);
}
