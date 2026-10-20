import { normalizeTags } from "../normalize";
import { ENTITY_TYPES } from "../types";
import { attempt, httpNote, plural } from "./helpers";
import { result, type CheckContext, type CheckResult, type Seeds } from "./types";

/** Endpoint-level P4 and `VERIFY with live key` checks that do not depend on a city. */

const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_DAYS = 180;

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/** filter.results.entities: Qloo should rank exactly the shortlist we supply. */
export async function scoringCheck(ctx: CheckContext, seeds: Seeds): Promise<CheckResult> {
  const id = "insights.results_entities";
  const area = "filter.results.entities";
  const signal = seeds.films[0] ?? seeds.artists[0];
  const shortlist = seeds.artists.slice(0, 3);
  if (!signal || shortlist.length === 0) return result(id, area, "SKIP", "needs a signal entity and an artist shortlist");
  const r = await attempt(() => ctx.client.insights({ type: ENTITY_TYPES.artist, entities: [signal.id], resultsEntities: shortlist.map((e) => e.id), take: 10 }));
  if (!r.ok) {
    return result(id, area, "FAIL", `${r.message}${httpNote(r.status)}`, "Taste Proof cannot score picks: check the parameter name filter.results.entities and that ids are comma-separated entity ids.");
  }
  const ids = new Set(shortlist.map((e) => e.id));
  const got = r.value.data;
  const outside = got.filter((e) => !ids.has(e.id)).length;
  const scored = got.filter((e) => e.affinity !== undefined).length;
  if (got.length === 0) return result(id, area, "FAIL", "no scores returned for a shortlist of known entities", "Taste Proof would show every pick as 'not found'. Check the signal entity and the shortlist ids.");
  if (outside > 0) return result(id, area, "WARN", `${outside} result(s) outside the shortlist: the filter looks ignored`, "Qloo silently ignores unknown parameters: confirm filter.results.entities in the docs and pass ids exactly as returned by /search.");
  if (scored === 0) return result(id, area, "WARN", `${plural(got.length, "entity")} returned without affinity scores`, "Request feature.explainability or check where affinity lives in the payload (normalize.ts).");
  return result(id, area, "PASS", `${scored}/${shortlist.length} shortlisted entities scored`);
}

export async function demographicsCheck(ctx: CheckContext, seeds: Seeds): Promise<CheckResult> {
  const id = "demographics";
  const entity = seeds.artists[0] ?? seeds.films[0];
  if (!entity) return result(id, "Demographics", "SKIP", "no seed entity");
  const r = await attempt(() => ctx.client.demographics({ entities: [entity.id] }));
  if (!r.ok) return result(id, "Demographics", "FAIL", `${r.message}${httpNote(r.status)}`, "Check filter.type=urn:demographics with signal.interests.entities. The audience 'who they are' lines will be empty meanwhile.");
  const d = r.value.data[0];
  const age = d ? Object.keys(d.age).length : 0;
  const gender = d ? Object.keys(d.gender).length : 0;
  if (age > 0 && gender > 0) return result(id, "Demographics", "PASS", `${plural(age, "age band")}, ${plural(gender, "gender value")}`);
  if (age > 0 || gender > 0) return result(id, "Demographics", "WARN", `only ${age > 0 ? "age" : "gender"} data returned`, "Use whichever dimension is present; hide the missing one in the brief.");
  return result(id, "Demographics", "FAIL", "no demographic data returned", "Skip the demographics section or fall back to tags; check that the entity type supports demographics.");
}

export async function trendingCheck(ctx: CheckContext, seeds: Seeds): Promise<CheckResult> {
  const id = "trending";
  if (seeds.artists.length === 0) return result(id, "Trending", "SKIP", "no artist seeds");
  const r = await attempt(() =>
    ctx.client.trending({
      type: ENTITY_TYPES.artist,
      entities: seeds.artists.map((a) => a.id),
      startDate: isoDate(new Date(ctx.now.getTime() - TREND_DAYS * DAY_MS)),
      endDate: isoDate(ctx.now),
      take: 4,
    }),
  );
  if (!r.ok) return result(id, "Trending", "FAIL", `${r.message}${httpNote(r.status)}`, "Check /v2/trending parameters (filter.start_date / filter.end_date as YYYY-MM-DD). Trending is optional: the sound section works without it.");
  if (r.value.data.length === 0) return result(id, "Trending", "WARN", "no trend points in the last 30 days", "Try a wider date window; the brief simply omits the trend line when empty.");
  return result(id, "Trending", "PASS", plural(r.value.data.length, "trend point"));
}

async function accepted(ctx: CheckContext, path: string): Promise<boolean> {
  try {
    return (await ctx.probe(path)).status === 200;
  } catch {
    return false;
  }
}

type TypeCandidate = { readonly id: string; readonly label: string; readonly current: string; readonly alternatives: readonly string[]; readonly constant: string };

const TYPE_CANDIDATES: readonly TypeCandidate[] = [
  { id: "types.destination", label: "destination", current: ENTITY_TYPES.destination, alternatives: ["urn:entity:locality"], constant: "ENTITY_TYPES.destination" },
  { id: "types.video_game", label: "video game", current: ENTITY_TYPES.videoGame, alternatives: ["urn:entity:video_game"], constant: "ENTITY_TYPES.videoGame" },
];

/** Entity type spellings (settled live 2026-10-20 in types.ts): which spelling does insights accept? */
export async function typeSpellingChecks(ctx: CheckContext, seeds: Seeds): Promise<CheckResult[]> {
  const entity = seeds.artists[0] ?? seeds.films[0];
  return Promise.all(
    TYPE_CANDIDATES.map(async (c): Promise<CheckResult> => {
      const area = "Entity type spelling";
      if (!entity) return result(c.id, area, "SKIP", "no seed entity");
      const path = (type: string) => `/v2/insights?filter.type=${encodeURIComponent(type)}&signal.interests.entities=${encodeURIComponent(entity.id)}&take=1`;
      if (await accepted(ctx, path(c.current))) return result(c.id, area, "PASS", `${c.current} accepted`);
      for (const alt of c.alternatives) {
        if (await accepted(ctx, path(alt))) return result(c.id, area, "FAIL", `${c.current} rejected, ${alt} accepted`, `Change ${c.constant} in src/lib/qloo/types.ts to "${alt}".`);
      }
      return result(c.id, area, "WARN", `no spelling of ${c.label} accepted for this key`, `Remove ${c.constant} from any tool that offers it; the type is not enabled for this key.`);
    }),
  );
}

type NamedTags = readonly { readonly name: string }[];

async function tagNames(ctx: CheckContext, param: string, query: string): Promise<NamedTags | undefined> {
  try {
    const res = await ctx.probe(`/v2/tags?${param}=${encodeURIComponent(query)}&take=10`);
    return res.status === 200 ? normalizeTags(res.body) : undefined;
  } catch {
    return undefined;
  }
}

const TAG_PARAM_CANDIDATES = ["filter.query", "query", "filter.tag.query"];
const TAG_PROBES = ["jazz", "ramen"];

/** Qloo ignores unknown parameters, so a working text param must return different, query-related tags per query. */
export async function tagParamCheck(ctx: CheckContext): Promise<CheckResult> {
  const id = "tags.search_param";
  const area = "Tag search parameter";
  const works = async (param: string): Promise<"yes" | "ignored" | "no"> => {
    const [a, b] = await Promise.all(TAG_PROBES.map((q) => tagNames(ctx, param, q)));
    if (!a || !b) return "no";
    const key = (t: NamedTags) => t.map((x) => x.name).join("|");
    const related = a.some((t) => t.name.toLowerCase().includes(TAG_PROBES[0])) || b.some((t) => t.name.toLowerCase().includes(TAG_PROBES[1]));
    return key(a) !== key(b) && related ? "yes" : key(a) === key(b) ? "ignored" : "no";
  };
  const current = await works("filter.query");
  if (current === "yes") return result(id, area, "PASS", "filter.query returns tags related to the text");
  for (const alt of TAG_PARAM_CANDIDATES.filter((p) => p !== "filter.query")) {
    if ((await works(alt)) === "yes") return result(id, area, "FAIL", `filter.query ${current === "ignored" ? "is silently ignored" : "does not work"}; ${alt} does`, `Change the text parameter in tagsQuery() (src/lib/qloo/query.ts) from "filter.query" to "${alt}".`);
  }
  return result(id, area, current === "ignored" ? "FAIL" : "WARN", current === "ignored" ? "the text parameter is ignored: every query returns the same tags" : "could not confirm a working tag search parameter", "Check /v2/tags in the API reference for the free-text parameter name and update tagsQuery() in src/lib/qloo/query.ts.");
}
