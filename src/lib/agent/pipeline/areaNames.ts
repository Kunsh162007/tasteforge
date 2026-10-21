import { distanceKm } from "../summaries";

/**
 * Names a hotspot from Qloo's own data. A heatmap cell has coordinates and no name; the top reference places around it
 * carry addresses ("H/1 Maguda Nagar, Vijay Nagar, Scheme No 54 Indore, Madhya Pradesh"), and the area most of them name is
 * a better label than "north of the Indore centre" or whatever a reverse geocoder knows. Reverse geocoding and compass
 * directions stay as the fallbacks.
 */

export type NearbyPlace = { readonly id: string; readonly lat: number; readonly lon: number; readonly address: string };

/** Places farther from the cell than this do not say what it is called. */
const NEIGHBOURHOOD_RADIUS_KM = 3;
const NEAREST_PLACES = 6;
const MAX_AREA_WORDS = 3;
const MIN_AREA_LETTERS = 4;
const MAX_SEGMENTS_BACK = 3;
/** A segment next to the city names the area most reliably; earlier ones count less. */
const SEGMENT_WEIGHTS = [3, 2, 1] as const;
/** An area needs this much support (one address that puts it beside the city, or several that mention it). */
const MIN_SUPPORT = 3;

/** Words of a street or building description: the area name starts after the last one of them. */
const BREAKERS = new Set([
  "road", "rd", "street", "st", "marg", "lane", "ln", "avenue", "ave", "av", "boulevard", "blvd", "bd", "drive", "dr", "way",
  "plot", "floor", "flr", "shop", "building", "bldg", "complex", "sector", "scheme", "phase", "block", "tower", "no", "gate",
  "entrance", "main", "bypass", "highway", "nh", "mall", "rue", "pl", "expressway", "opp", "opposite", "near", "behind", "above", "beside", "next",
]);
const LOCATOR_TAIL = /\b(near|opp\.?|opposite|behind|beside|above|next to)\b.*$/i;

const lower = (s: string): string => s.trim().toLowerCase();

function titleCase(words: readonly string[]): string {
  return words.map((w) => (w === w.toUpperCase() && w.length > 2 ? `${w[0]}${w.slice(1).toLowerCase()}` : w)).join(" ");
}

/** The trailing run of area-like words in a text, longest first: every suffix of one to three words. */
function suffixes(text: string): string[] {
  const words = text
    .replace(LOCATOR_TAIL, "")
    .split(/[\s]+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.]+$/gu, ""))
    .filter(Boolean);
  const run: string[] = [];
  for (let i = words.length - 1; i >= 0; i -= 1) {
    const w = words[i];
    if (/\d/.test(w) || BREAKERS.has(lower(w).replace(/\.$/, "")) || w.length < 2 || (w === w.toUpperCase() && w.length <= 2)) break;
    run.unshift(w);
    if (run.length === MAX_AREA_WORDS) break;
  }
  if (run.length === 0) return [];
  const all = run.map((_, i) => run.slice(i));
  // A lone word is only an area when the whole run is one word ("Bankside"); the last word of "Vijay Nagar" is not.
  return all.filter((s) => s.length > 1 || run.length === 1).map(titleCase);
}

export type AreaCandidate = { readonly name: string; readonly weight: number };

/** Area names an address suggests, each with the weight of the segment it came from; empty when it names none. */
export function areaCandidates(address: string, city: string): AreaCandidate[] {
  const segments = address.split(",").map((s) => s.trim()).filter(Boolean);
  const cityAt = segments.reduce((found, s, i) => (lower(s).includes(lower(city)) ? i : found), -1);
  if (cityAt < 0) return [];
  const out: AreaCandidate[] = [];
  for (let back = 0; back < MAX_SEGMENTS_BACK && cityAt - back >= 0; back += 1) {
    const segment = segments[cityAt - back];
    const text = back === 0 ? segment.slice(0, lower(segment).indexOf(lower(city))) : segment;
    for (const name of suffixes(text)) {
      const letters = name.replace(/[^\p{L}]/gu, "").length;
      if (letters >= MIN_AREA_LETTERS && lower(name) !== lower(city)) out.push({ name, weight: SEGMENT_WEIGHTS[back] });
    }
  }
  return out;
}

/**
 * The area name most of the nearest places agree on, or undefined when none has enough support. `taken` holds lower-case
 * names other hotspots already use.
 */
export function nameAreaFromPlaces(
  cell: { readonly lat: number; readonly lon: number },
  places: readonly NearbyPlace[],
  city: string,
  taken: ReadonlySet<string> = new Set(),
): string | undefined {
  const near = places
    .map((p) => ({ p, km: distanceKm({ latitude: cell.lat, longitude: cell.lon }, { latitude: p.lat, longitude: p.lon }) }))
    .filter((x) => x.km <= NEIGHBOURHOOD_RADIUS_KM)
    .sort((a, b) => a.km - b.km || a.p.id.localeCompare(b.p.id))
    .slice(0, NEAREST_PLACES);
  const scores = new Map<string, { name: string; score: number }>();
  for (const { p } of near) {
    for (const c of areaCandidates(p.address, city)) {
      const key = lower(c.name);
      scores.set(key, { name: c.name, score: (scores.get(key)?.score ?? 0) + c.weight });
    }
  }
  const best = [...scores.entries()]
    .filter(([key, v]) => v.score >= MIN_SUPPORT && !taken.has(key))
    .sort((a, b) => b[1].score - a[1].score || a[1].name.length - b[1].name.length || a[0].localeCompare(b[0]))[0];
  return best?.[1].name;
}
