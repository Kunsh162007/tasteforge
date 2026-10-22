import type { QlooClient, QlooEntity } from "@/lib/qloo";
import { logWarn } from "@/lib/log";
import { CITY_RADIUS_KM, type GeoPoint } from "./pipeline/guard";
import { distanceKm } from "./summaries";

/**
 * Checks a name against Qloo without blaming Qloo's catalogue on the person who named it. A pick is searched across every
 * entity type (a venue may be listed as a brand, an author as a person), names are compared after removing accents,
 * "The", punctuation and descriptors like "Cafe" or "Cocktail Lounge", and a place is judged against its city. The answer
 * is one of four statuses, none of which says "invented": that claim needs evidence Qloo cannot give.
 */

export type VerifyKind = "artist" | "place" | "brand";

/**
 * verified: Qloo lists an entity of that type with that name (for a place: in the requested city).
 * wrong_type: Qloo lists a same-named entity, but as another type (an author, a brand, a person).
 * other_city: Qloo lists the place, but only outside the requested city.
 * unverified: no entity of that name in Qloo's data.
 */
export type VerifyStatus = "verified" | "wrong_type" | "other_city" | "unverified";

export type VerifyHit = { readonly id: string; readonly name: string; readonly kinds: readonly string[]; readonly lat?: number; readonly lon?: number };

export type Verdict = {
  readonly status: VerifyStatus;
  /** The matching entity of the right type (verified, other_city); absent otherwise. */
  readonly qlooId?: string;
  /** The same-named entity's name and type when the status is wrong_type. */
  readonly matchedName?: string;
  readonly matchedKind?: string;
};

const ARTICLES = new Set(["the", "a", "an", "le", "la", "les", "el", "los", "las", "il", "lo", "der", "die", "das", "de", "du", "des", "of", "and", "at"]);
/** Descriptors that say what kind of venue or company it is, not which one: a pick and a Qloo entry often differ in them. */
const DESCRIPTORS = new Set([
  "cafe", "bar", "restaurant", "pub", "lounge", "cocktail", "coffee", "roasters", "roastery", "kitchen", "bistro", "brasserie", "eatery",
  "tavern", "grill", "company", "co", "inc", "ltd", "llc", "corporation", "corp", "store", "shop", "salon",
]);

/** Name as it should be compared: no accents, article words, punctuation, parentheses or " | Branch" tails. */
export function nameTokens(name: string): string[] {
  const text = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+\|\s+.*$/, "")
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const all = text.split(" ").filter(Boolean);
  const kept = all.filter((t) => !ARTICLES.has(t) && !DESCRIPTORS.has(t));
  // "Cafe" alone, or "The Bar", would vanish: fall back to the plain words.
  return kept.length > 0 ? kept : all;
}

const MIN_CONTAINED_TOKENS = 2;

/** Same words after normalising, or the shorter name (two or more words) contained in the longer one in order. */
export function namesMatch(a: string, b: string): boolean {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (x.length === 0 || y.length === 0) return false;
  if (x.join(" ") === y.join(" ")) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length < MIN_CONTAINED_TOKENS) return false;
  return ` ${long.join(" ")} `.includes(` ${short.join(" ")} `);
}

/** The name as written and the name without a ", City" or " - Neighbourhood" tail ("Barcade, Williamsburg" becomes "Barcade"). */
export function nameVariants(name: string): string[] {
  const head = name.split(/\s*[,–—]\s*|\s+-\s+/)[0].trim();
  return head && head !== name.trim() ? [name.trim(), head] : [name.trim()];
}

const WANTED: Record<VerifyKind, readonly string[]> = {
  artist: ["artist"],
  place: ["place", "destination"],
  brand: ["brand"],
};
/** Types a same-named entity may have for "wrong type" to be a fair description (not an album that shares a title). */
const LOOKALIKE: Record<VerifyKind, readonly string[]> = {
  artist: ["person", "author", "brand", "place"],
  place: ["brand", "artist", "person", "locality"],
  brand: ["place", "artist", "person", "author"],
};

const sharesKind = (hit: VerifyHit, kinds: readonly string[]): boolean => hit.kinds.some((k) => kinds.includes(k));

/** Picks the judgement for a name from everything the searches returned. `anchor` is the city's centre for places. */
export function classifyHits(kind: VerifyKind, name: string, hits: readonly VerifyHit[], anchor?: GeoPoint): Verdict {
  const matching = hits.filter((h) => nameVariants(name).some((v) => namesMatch(v, h.name)));
  const right = matching.filter((h) => sharesKind(h, WANTED[kind]));
  if (right.length > 0) {
    if (kind !== "place" || !anchor) return { status: "verified", qlooId: right[0].id };
    const km = (h: VerifyHit): number =>
      h.lat === undefined || h.lon === undefined ? Infinity : distanceKm({ latitude: anchor.lat, longitude: anchor.lon }, { latitude: h.lat, longitude: h.lon });
    const nearest = right.reduce((a, b) => (km(b) < km(a) ? b : a));
    // Without coordinates there is nothing to judge the city by; the benefit of the doubt goes to the name.
    if (!Number.isFinite(km(nearest))) return { status: "verified", qlooId: nearest.id };
    return km(nearest) > CITY_RADIUS_KM ? { status: "other_city", qlooId: nearest.id } : { status: "verified", qlooId: nearest.id };
  }
  const other = matching.find((h) => sharesKind(h, LOOKALIKE[kind]));
  if (other) {
    const found = other.kinds.find((k) => LOOKALIKE[kind].includes(k));
    return { status: "wrong_type", matchedName: other.name, ...(found ? { matchedKind: found } : {}) };
  }
  return { status: "unverified" };
}

export const toHit = (e: QlooEntity): VerifyHit => ({
  id: e.id,
  name: e.name,
  kinds: e.kinds ?? [e.type.split(":").pop() ?? ""],
  ...(e.location ? { lat: e.location.latitude, lon: e.location.longitude } : {}),
});

const SEARCH_TAKE = 10;

/** The names to search for, most likely first: as written, with the city, and without descriptors. */
export function searchQueries(kind: VerifyKind, name: string, city?: string): string[] {
  const variants = nameVariants(name);
  const head = variants[variants.length - 1];
  const plain = nameTokens(head).join(" ");
  const queries = [head, kind === "place" && city ? `${head} ${city}` : undefined, plain !== head.toLowerCase() ? plain : undefined];
  return [...new Set(queries.filter((q): q is string => q !== undefined && q.trim() !== ""))];
}

export type VerifyContext = { readonly city?: string; readonly anchor?: GeoPoint };

/**
 * Looks the name up, trying up to three queries (stopping at the first that verifies it), across all entity types.
 * A failed search counts as no hits for that query; it never throws.
 */
export async function verifyPick(qloo: QlooClient, kind: VerifyKind, name: string, ctx: VerifyContext = {}): Promise<Verdict> {
  const hits: VerifyHit[] = [];
  let verdict: Verdict = { status: "unverified" };
  for (const query of searchQueries(kind, name, ctx.city)) {
    try {
      const r = await qloo.search({ query, take: SEARCH_TAKE });
      hits.push(...r.data.map(toHit));
    } catch (e) {
      logWarn("verify: search failed", e);
    }
    verdict = classifyHits(kind, name, hits, ctx.anchor);
    if (verdict.status === "verified") break;
  }
  return verdict;
}

/** The plain-words reason a pick is not verified, for the UI. */
export function statusLabel(status: VerifyStatus, v?: Pick<Verdict, "matchedKind">, city?: string): string {
  switch (status) {
    case "verified":
      return "Verified in Qloo";
    case "wrong_type":
      return v?.matchedKind ? `Wrong type: Qloo lists a ${v.matchedKind} by this name` : "Wrong type: Qloo lists something else by this name";
    case "other_city":
      return city ? `In Qloo, but not in ${city}` : "In Qloo, but in another city";
    case "unverified":
      return city ? `Not in Qloo's data for ${city}` : "Qloo couldn't verify";
  }
}
