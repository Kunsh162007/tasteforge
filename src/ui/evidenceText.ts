import type { BriefSignals, Evidence } from "./contract";

/**
 * Plain-words reading of an evidence record for the "why" drawer: names instead of Qloo ids, the question that was asked
 * ("Places in Indore liked by people who like Prateek Kuhad"), and one sentence on why a pick is there.
 */

export type NameBook = ReadonlyMap<string, string>;

/** Placeholder the pipeline gives to an entity the user picked in a disambiguation round (its real name was not looked up). */
const UNKNOWN_NAME = "your pick";

/** Id to name for everything a record or the signals can name: seeds, result entities and tags. */
export function buildNameBook(evidence: readonly Evidence[], signals?: Pick<BriefSignals, "entityIds" | "entityNames" | "tagIds" | "tagNames">): NameBook {
  const book = new Map<string, string>();
  const add = (id: string, name: string | undefined): void => {
    if (name && name !== UNKNOWN_NAME && !book.has(id)) book.set(id, name);
  };
  signals?.entityIds.forEach((id, i) => add(id, signals.entityNames[i]));
  signals?.tagIds.forEach((id, i) => add(id, signals.tagNames[i]));
  for (const r of evidence) {
    for (const e of r.entities ?? []) add(e.id, e.name);
    for (const t of r.tags ?? []) add(t.id, t.name);
  }
  return book;
}

const ids = (value: string | undefined): string[] => (value ? value.split(",").map((s) => s.trim()).filter(Boolean) : []);

const MAX_NAMES = 3;

/** "A, B and C"; only the first few when there are many ("A, B, C and 2 more"). */
export function joinNames(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  const shown = names.slice(0, MAX_NAMES);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(", ")} and ${rest} more`;
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/** Names of the entities and tags a record was asked about; ids that cannot be named are skipped. */
export function signalNames(r: Pick<Evidence, "params">, book: NameBook): string[] {
  return [...ids(r.params.entity_ids), ...ids(r.params.tag_ids)].flatMap((id) => {
    const name = book.get(id);
    return name ? [name] : [];
  });
}

const KIND_PLURAL: Readonly<Record<string, string>> = {
  artist: "Artists",
  place: "Places",
  brand: "Brands",
  movie: "Films",
  tv_show: "TV shows",
  book: "Books",
  podcast: "Podcasts",
  video_game: "Video games",
  destination: "Destinations",
  person: "People",
};

const likedBy = (names: readonly string[]): string => (names.length > 0 ? `people who like ${joinNames(names)}` : "this audience");

/** The question a record answers, in words: "Places in Indore liked by people who like Prateek Kuhad". */
export function questionFor(r: Evidence, book: NameBook): string {
  const names = signalNames(r, book);
  const p = r.params;
  if (r.endpoint === "/search") return `Which Qloo entity is “${p.query ?? "this name"}”?`;
  if (r.endpoint === "/v2/tags") return `Which Qloo tags match “${p.query ?? "this concept"}”?`;
  if (r.endpoint.includes("urn:tag")) {
    const kinds = /decor|ambience/.test(p.tag_types ?? "") ? "decor and ambience" : /cuisine|dish|genre/.test(p.tag_types ?? "") ? "cuisine and dish" : "descriptive";
    return `Which ${kinds} tags do the audience's favourite places share?`;
  }
  if (r.endpoint.includes("demographics")) return `Age and gender of ${likedBy(names)}`;
  if (r.endpoint.includes("heatmap")) return `Where in ${p.location ?? "the city"} do ${likedBy(names)} concentrate?`;
  if (r.endpoint.includes("trending")) return `Is ${joinNames(names) || "this pick"} rising or falling in popularity?`;
  const kind = KIND_PLURAL[p.type ?? ""] ?? "Results";
  const where = p.location ? ` in ${p.location}` : "";
  const local = p.signal_location ? `, weighted toward ${p.signal_location}` : "";
  return `${kind}${where} liked by ${likedBy(names)}${local}`;
}

const MAX_WHY_NAMES = 2;

/**
 * One sentence on why `label` is in the brief: the record that lists it, who it was asked for, and the affinity.
 * Undefined when no given record lists the label.
 */
export function whySentence(label: string, records: readonly Evidence[], book: NameBook): string | undefined {
  const wanted = label.toLowerCase();
  for (const r of records) {
    const hit = r.entities?.find((e) => e.name.toLowerCase() === wanted || wanted.startsWith(e.name.toLowerCase()));
    if (!hit) continue;
    const names = signalNames(r, book).slice(0, MAX_WHY_NAMES);
    const who = names.length > 0 ? `people who like ${joinNames(names)}` : "this audience";
    const where = r.params.location ? ` in ${r.params.location}` : r.params.signal_location ? ` near ${r.params.signal_location}` : "";
    const score = hit.affinity === undefined ? "" : ` (affinity ${hit.affinity.toFixed(2)})`;
    return `Qloo: ${who}${where} over-index on ${hit.name}${score}.`;
  }
  return undefined;
}

/** Param values with ids swapped for names where known, for the collapsed raw view. */
export function readableParams(r: Pick<Evidence, "params">, book: NameBook): [string, string][] {
  return Object.entries(r.params).map(([key, value]) => {
    if (!/(^|_)(entity|tag)_ids?$|ids$/.test(key)) return [key, value];
    return [key, ids(value).map((id) => book.get(id) ?? id).join(", ")];
  });
}

/** True when the record weights its taste signal toward a place (`signal_location`). */
export const isLocalRecord = (r: Pick<Evidence, "params">): boolean => Boolean(r.params.signal_location);

/** The place a list of items was localized to, when any cited record was. */
export function localCity(evidenceIds: readonly string[], evidence: Readonly<Record<string, Evidence>>): string | undefined {
  for (const id of evidenceIds) {
    const city = evidence[id]?.params.signal_location;
    if (city) return city;
  }
  return undefined;
}

const SATURATION_SPREAD = 0.015;
const MIN_FOR_SATURATION = 3;

/**
 * A note for a list whose affinities are all the same: Qloo saturates when many results match the signal equally well, so
 * the order of the list is not a ranking. Undefined when the scores differ or there are too few to tell.
 */
export function rankingNote(items: readonly { readonly qlooId?: string; readonly evidence: readonly string[] }[], evidence: Readonly<Record<string, Evidence>>): string | undefined {
  const scores: number[] = [];
  for (const item of items) {
    if (!item.qlooId) continue;
    for (const id of item.evidence) {
      const hit = evidence[id]?.entities?.find((e) => e.id === item.qlooId);
      if (hit?.affinity !== undefined) {
        scores.push(hit.affinity);
        break;
      }
    }
  }
  if (scores.length < MIN_FOR_SATURATION) return undefined;
  const high = Math.max(...scores);
  if (high - Math.min(...scores) > SATURATION_SPREAD) return undefined;
  return `Qloo scores all of these about the same (${high.toFixed(2)}), so the order is not a ranking: they fit equally well.`;
}
