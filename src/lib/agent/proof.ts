import { z } from "zod";
import type { JsonObject, LlmProvider } from "@/lib/llm";
import { ENTITY_TYPES, type QlooClient } from "@/lib/qloo";
import type { Brief } from "./brief";
import type { ScoredPick, TasteProof } from "./events";
import type { Ledger } from "./ledger";
import type { Signals } from "./pipeline/resolve";
import { tagsFor } from "./pipeline/routing";
import { stripNulls } from "./pipeline/seeds";
import { logWarn } from "@/lib/log";
import { DATA_RULE, fence } from "./fence";
import { toToolParameters } from "./toolSchemas";

/**
 * Taste Proof (plan section 8.2): ask a plain LLM with no Qloo data for picks, then let Qloo score
 * both the baseline and TasteForge's picks against the same audience signals with
 * `filter.results.entities`. The score measures fit with the audience's Qloo taste signals.
 */

export type PickKind = ScoredPick["kind"];
export type PickRef = {
  readonly name: string;
  readonly kind: PickKind;
  readonly qlooId?: string;
  readonly evidence?: readonly string[];
  readonly address?: string;
  readonly local?: boolean;
};

const KINDS: readonly PickKind[] = ["artist", "place", "brand"];
const BASELINE_COUNTS: Readonly<Record<PickKind, number>> = { artist: 6, place: 6, brand: 4 };
const MAX_SIGNAL_ENTITIES = 5;
const SCORE_TAKE = 50;
const NAME_MAX_CHARS = 80;

const URNS = { artist: ENTITY_TYPES.artist, place: ENTITY_TYPES.place, brand: ENTITY_TYPES.brand } as const;

const names = (what: string) => z.array(z.string().max(NAME_MAX_CHARS)).max(10).describe(what);

const BaselineSchema = z.object({
  artists: names("About 6 real artists or bands."),
  places: names("About 6 real venues, cafes, shops or restaurants."),
  brands: names("About 4 real brands."),
});

const BASELINE_SYSTEM = `You are a helpful assistant with no access to any data source. Recommend real, specific names that fit the audience described. Reply with JSON only: artists (6), places (6 real venues, in the given city when one is given) and brands (4). Always give the full number of each. ${DATA_RULE}`;

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function cleanNames(list: readonly string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const name = raw.trim();
    if (name === "" || seen.has(norm(name))) continue;
    seen.add(norm(name));
    out.push(name);
    if (out.length === limit) break;
  }
  return out;
}

export type BaselineRequest = { readonly prompt: string; readonly city?: string };

/** One main-model JSON call asking for picks without any Qloo data. Returns [] when the reply is unusable. */
export async function fetchBaselineNames(llm: LlmProvider, r: BaselineRequest): Promise<PickRef[]> {
  const raw = await llm.chatJson({
    system: BASELINE_SYSTEM,
    prompt: `Audience and project: ${fence(r.prompt)}\nCity: ${r.city ? fence(r.city) : "none given"}`,
    schema: toToolParameters(BaselineSchema) as JsonObject,
    // Same chain as TasteForge's own synthesis, so Taste Proof compares like with like.
    tier: "main",
    route: "main",
  });
  const parsed = BaselineSchema.safeParse(stripNulls(raw));
  if (!parsed.success) return [];
  const { artists, places, brands } = parsed.data;
  const byKind: Record<PickKind, string[]> = { artist: artists, place: places, brand: brands };
  return KINDS.flatMap((kind) => cleanNames(byKind[kind], BASELINE_COUNTS[kind]).map((name) => ({ name, kind })));
}

/** Resolves each baseline name to a Qloo entity via search; names Qloo cannot find stay without an id. */
export async function resolveBaseline(qloo: QlooClient, picks: readonly PickRef[]): Promise<PickRef[]> {
  return Promise.all(
    picks.map(async (p): Promise<PickRef> => {
      try {
        const r = await qloo.search({ query: p.name, types: [URNS[p.kind]], take: 1 });
        const hit = r.data[0];
        return hit ? { ...p, qlooId: hit.id } : p;
      } catch (e) {
        logWarn("taste proof: baseline lookup failed", e);
        return p;
      }
    }),
  );
}

/** Entity id to kind, learned from which insights/search call returned it. */
function entityKinds(ledger: Ledger): Map<string, PickKind> {
  const out = new Map<string, PickKind>();
  for (const r of ledger.records) {
    const raw = r.endpoint === "/v2/insights" ? r.params.type : r.endpoint === "/search" ? r.params.types : undefined;
    const kind = KINDS.find((k) => k === raw);
    if (kind) for (const e of r.entities ?? []) if (!out.has(e.id)) out.set(e.id, kind);
  }
  return out;
}

type EntityFacts = {
  readonly name: string;
  readonly address?: string;
  readonly located: boolean;
  /** Ledger records that list this entity, in ledger order. */
  readonly records: readonly string[];
};

function entityFacts(ledger: Ledger): Map<string, EntityFacts> {
  const out = new Map<string, EntityFacts>();
  for (const r of ledger.records) {
    for (const e of r.entities ?? []) {
      const prev = out.get(e.id);
      const address = e.note?.split(" | ")[0];
      out.set(e.id, {
        name: prev?.name ?? e.name,
        address: prev?.address ?? address,
        located: (prev?.located ?? false) || (e.lat !== undefined && e.lon !== undefined),
        records: [...(prev?.records ?? []), r.id],
      });
    }
  }
  return out;
}

/** The brief items that are real Qloo entities of each kind, in brief order (capped like the baseline). */
export function tasteforgePicks(brief: Brief, ledger: Ledger): PickRef[] {
  const kinds = entityKinds(ledger);
  const facts = entityFacts(ledger);
  const byLabel = new Map<string, string>();
  for (const [id, f] of facts) if (!byLabel.has(norm(f.name))) byLabel.set(norm(f.name), id);
  const sources: readonly (readonly [PickKind, readonly { label: string; qlooId?: string; evidence: readonly string[] }[]])[] = [
    ["artist", brief.sound.artists],
    ["place", brief.aesthetic.referencePlaces],
    ["brand", brief.pairings],
  ];
  return sources.flatMap(([kind, items]) => {
    const picked = new Map<string, readonly string[]>();
    for (const item of items) {
      const id = item.qlooId && kinds.get(item.qlooId) === kind ? item.qlooId : byLabel.get(norm(item.label));
      if (id && kinds.get(id) === kind && !picked.has(id)) picked.set(id, item.evidence);
      if (picked.size === BASELINE_COUNTS[kind]) break;
    }
    return [...picked].map(([id, cited]) => pickFor(kind, id, cited, facts.get(id)));
  });
}

function pickFor(kind: PickKind, id: string, cited: readonly string[], f: EntityFacts | undefined): PickRef {
  const listed = f?.records ?? [];
  const evidence = cited.filter((c) => listed.includes(c));
  const trace = (evidence.length > 0 ? evidence : listed).slice(0, 3);
  const isPlace = kind === "place";
  return {
    name: f?.name ?? id,
    kind,
    qlooId: id,
    ...(trace.length > 0 ? { evidence: trace } : {}),
    ...(isPlace && f?.address ? { address: f.address } : {}),
    ...(isPlace ? { local: Boolean(f?.address && f.located) } : {}),
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Qloo's affinity for each id in the shortlist against the shared audience signals; undefined on failure. */
async function scoreKind(
  qloo: QlooClient,
  kind: PickKind,
  signals: Signals,
  ids: readonly string[],
): Promise<Map<string, number> | undefined> {
  try {
    const r = await qloo.insights({
      type: URNS[kind],
      entities: signals.entityIds.slice(0, MAX_SIGNAL_ENTITIES),
      tags: tagsFor(kind, signals),
      resultsEntities: ids,
      take: Math.min(Math.max(ids.length, 1), SCORE_TAKE),
    });
    return new Map(r.data.map((e) => [e.id, e.affinity ?? 0]));
  } catch (e) {
    logWarn(`taste proof: ${kind} scoring failed`, e);
    return undefined;
  }
}

/** Mean over picks Qloo found; picks it could not find are counted separately, never averaged in as zero. */
function average(picks: readonly ScoredPick[]): number | null {
  const scored = picks.flatMap((p) => (p.affinity === null ? [] : [p.affinity]));
  return scored.length === 0 ? null : round2(scored.reduce((a, b) => a + b, 0) / scored.length);
}

function scorePick(p: PickRef, scores: ReadonlyMap<string, number>): ScoredPick {
  const traced = {
    ...(p.evidence ? { evidence: p.evidence } : {}),
    ...(p.address ? { address: p.address } : {}),
    ...(p.local !== undefined ? { local: p.local } : {}),
  };
  if (!p.qlooId) return { name: p.name, kind: p.kind, affinity: null, ...traced };
  // An id Qloo did not score has no affinity to report: null, never a made-up 0.
  const score = scores.get(p.qlooId);
  return { name: p.name, kind: p.kind, qlooId: p.qlooId, affinity: score === undefined ? null : round2(score), ...traced };
}

export type ProofInput = {
  readonly qloo: QlooClient;
  readonly signals: Signals;
  /** Baseline picks already resolved to Qloo ids (or left without one). */
  readonly baseline: readonly PickRef[];
  readonly tasteforge: readonly PickRef[];
  readonly city?: string;
};

/**
 * Scores both lists per kind with one shortlist call each. A kind is compared only when TasteForge has
 * picks for it and Qloo answered; with no usable signal or no comparable kind the result is undefined.
 */
export async function scoreProof(i: ProofInput): Promise<TasteProof | undefined> {
  if (i.signals.entityIds.length === 0 && i.signals.tagIds.length === 0) return undefined;
  // The user's own seeds are input, not recommendations: leave them out of both lists.
  const seeds = new Set(i.signals.entityIds);
  const seedNames = new Set(i.signals.entityNames.map(norm));
  const isSeed = (p: PickRef): boolean => (p.qlooId !== undefined && seeds.has(p.qlooId)) || seedNames.has(norm(p.name));
  const baseline: ScoredPick[] = [];
  const tasteforge: ScoredPick[] = [];
  const perKind = await Promise.all(
    KINDS.map(async (kind) => {
      const mine = i.tasteforge.filter((p) => p.kind === kind && !isSeed(p));
      const theirs = i.baseline.filter((p) => p.kind === kind && !isSeed(p));
      if (mine.length === 0) return undefined;
      const ids = [...new Set([...mine, ...theirs].flatMap((p) => (p.qlooId ? [p.qlooId] : [])))];
      const scores = await scoreKind(i.qloo, kind, i.signals, ids);
      return scores ? { mine, theirs, scores } : undefined;
    }),
  );
  for (const k of perKind) {
    if (!k) continue;
    baseline.push(...k.theirs.map((p) => scorePick(p, k.scores)));
    tasteforge.push(...k.mine.map((p) => scorePick(p, k.scores)));
  }
  if (tasteforge.length === 0) return undefined;
  return {
    baseline,
    tasteforge,
    baselineAvg: average(baseline),
    tasteforgeAvg: average(tasteforge),
    baselineNotFound: baseline.filter((p) => p.affinity === null).length,
    ...(i.city ? { city: i.city } : {}),
  };
}

/**
 * Starts the baseline in the background; never rejects (a failed baseline simply means no proof).
 * The LLM call starts at once; `gate` holds back the Qloo lookups (about 16 searches) so they do not queue
 * in front of the graph walk's own calls.
 */
export function startBaseline(llm: LlmProvider, qloo: QlooClient, r: BaselineRequest, gate?: Promise<unknown>): Promise<PickRef[]> {
  return fetchBaselineNames(llm, r)
    .then(async (picks) => {
      if (gate) await gate;
      return resolveBaseline(qloo, picks);
    })
    .catch((e: unknown) => {
      logWarn("taste proof: baseline unavailable", e);
      return [];
    });
}
