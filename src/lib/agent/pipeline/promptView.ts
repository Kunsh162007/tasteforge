import type { Evidence, EvidenceEntity, EvidenceTag } from "../ledger";

/**
 * The compact view of the evidence the writer model is shown. Everything the model does not need to write the brief is
 * left out (coordinates, affinities except for hotspots, tag ids, summaries that repeat the lists) and the long Qloo
 * ids are replaced by short aliases that code maps back, so a brief costs roughly half the tokens of the full records.
 */

/** Ids at most this long (mock ids, geohashes; Qloo UUIDs are 36 characters) are cheap enough to show as they are. */
const MAX_PLAIN_ID_CHARS = 24;
const NOTE_CHARS: Readonly<Record<string, number>> = { place: 110, heatmap: 110, brand: 70 };
const ENTITY_CAP: Readonly<Record<string, number>> = { movie: 6, tv_show: 4, artist: 6, brand: 5, place: 6, heatmap: 5, search: 2, trending: 3 };
const DEFAULT_ENTITY_CAP = 4;
const TAG_CAP = { style: 8, menu: 6, concept: 3 } as const;
const ALIAS_PATTERN = /^q\d+$/;


export type Aliases = {
  readonly toAlias: ReadonlyMap<string, string>;
  readonly toId: ReadonlyMap<string, string>;
};

/** Short aliases (q1, q2, ...) for every long entity id in the records, in order of appearance. */
export function createAliases(records: readonly Evidence[]): Aliases {
  const toAlias = new Map<string, string>();
  const toId = new Map<string, string>();
  for (const record of records) {
    for (const e of record.entities ?? []) {
      if (e.id.length <= MAX_PLAIN_ID_CHARS || toAlias.has(e.id)) continue;
      const alias = `q${toAlias.size + 1}`;
      toAlias.set(e.id, alias);
      toId.set(alias, e.id);
    }
  }
  return { toAlias, toId };
}

/**
 * The model's reply with every `qlooId` mapped back to the real Qloo id. An alias that was never issued is removed
 * (the item keeps its evidence ids; only the link to an entity is lost).
 */
export function restoreIds(value: unknown, aliases: Aliases): unknown {
  if (Array.isArray(value)) return value.map((v) => restoreIds(v, aliases));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (key === "qlooId" && typeof v === "string") {
      const real = aliases.toId.get(v);
      if (real) out[key] = real;
      else if (!ALIAS_PATTERN.test(v)) out[key] = v;
    } else {
      out[key] = restoreIds(v, aliases);
    }
  }
  return out;
}

function kindOf(e: Evidence): string {
  if (e.endpoint.includes("heatmap")) return "heatmap";
  if (e.endpoint.includes("trending")) return "trending";
  if (e.endpoint === "/search") return "search";
  return e.params.type ?? "other";
}

const clip = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

function entityView(x: EvidenceEntity, kind: string, aliases: Aliases): Record<string, unknown> {
  const noteChars = NOTE_CHARS[kind];
  return {
    id: aliases.toAlias.get(x.id) ?? x.id,
    name: x.name,
    ...(noteChars && x.note ? { note: clip(x.note, noteChars) } : {}),
    ...(kind === "heatmap" && x.affinity !== undefined ? { affinity: x.affinity } : {}),
  };
}

const names = (tags: readonly EvidenceTag[], cap: number): string[] => tags.slice(0, cap).map((t) => t.name);

/** Tags grouped the way the writer uses them: decor for materials, ambience for lighting, the rest by name. */
function tagFields(tags: readonly EvidenceTag[]): Record<string, unknown> {
  const decor = tags.filter((t) => t.id.startsWith("urn:tag:decor:"));
  const ambience = tags.filter((t) => t.id.startsWith("urn:tag:ambience:"));
  if (decor.length + ambience.length > 0) {
    return {
      ...(decor.length > 0 ? { decor: names(decor, TAG_CAP.style) } : {}),
      ...(ambience.length > 0 ? { ambience: names(ambience, TAG_CAP.style) } : {}),
    };
  }
  const menu = tags.some((t) => /^urn:tag:(cuisine|specialty_dish|genre:place)/.test(t.id));
  return { tags: names(tags, menu ? TAG_CAP.menu : TAG_CAP.concept) };
}

/** The record as the writer sees it. The summary is kept only where it carries information the lists do not. */
export function leanView(e: Evidence, aliases: Aliases): Record<string, unknown> {
  const kind = kindOf(e);
  const entities = e.entities?.slice(0, ENTITY_CAP[kind] ?? DEFAULT_ENTITY_CAP).map((x) => entityView(x, kind, aliases));
  const tags = e.tags ?? [];
  const keepSummary = !entities?.length && tags.length === 0 ? true : kind === "heatmap" || kind === "trending";
  return {
    evidence_id: e.id,
    ...(keepSummary ? { summary: e.summary } : {}),
    ...(entities?.length ? { entities } : {}),
    ...(tags.length > 0 ? tagFields(tags) : {}),
  };
}

