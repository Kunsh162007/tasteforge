/**
 * Where a city is, and how far out still counts as "in" it. Qloo's heatmap is not limited to the city asked for: the
 * strongest cells for "New York" lie upstate (Rochester, Buffalo), and for London and Chicago they include airports and
 * outer villages. Hotspots are therefore kept only within a radius of the city centre, set by the city's size.
 */

export type CityCentre = { readonly lat: number; readonly lon: number; readonly radiusKm: number };

const DEFAULT_RADIUS_KM = 18;
const MIN_RADIUS_KM = 8;
const MAX_RADIUS_KM = 25;

const c = (lat: number, lon: number, radiusKm: number): CityCentre => ({ lat, lon, radiusKm });

/** Large metros get a wider reach, small cities a tighter one. Keys are lower-case, without accents. */
const KNOWN: Readonly<Record<string, CityCentre>> = {
  "new york": c(40.7128, -74.006, 25),
  "new york city": c(40.7128, -74.006, 25),
  nyc: c(40.7128, -74.006, 25),
  manhattan: c(40.7831, -73.9712, 12),
  brooklyn: c(40.6501, -73.9496, 12),
  queens: c(40.7282, -73.7949, 14),
  bronx: c(40.8448, -73.8648, 10),
  "staten island": c(40.5795, -74.1502, 11),
  london: c(51.5074, -0.1278, 25),
  chicago: c(41.8781, -87.6298, 20),
  paris: c(48.8566, 2.3522, 15),
  indore: c(22.7196, 75.8577, 14),
  mumbai: c(19.076, 72.8777, 22),
  delhi: c(28.6139, 77.209, 22),
  "new delhi": c(28.6139, 77.209, 22),
  bengaluru: c(12.9716, 77.5946, 20),
  bangalore: c(12.9716, 77.5946, 20),
  "los angeles": c(34.0522, -118.2437, 25),
  "san francisco": c(37.7749, -122.4194, 14),
  berlin: c(52.52, 13.405, 20),
  tokyo: c(35.6762, 139.6503, 25),
  melbourne: c(-37.8136, 144.9631, 18),
  sydney: c(-33.8688, 151.2093, 20),
  toronto: c(43.6532, -79.3832, 20),
  austin: c(30.2672, -97.7431, 16),
  seattle: c(47.6062, -122.3321, 16),
  portland: c(45.5152, -122.6784, 14),
  boston: c(42.3601, -71.0589, 14),
  amsterdam: c(52.3676, 4.9041, 12),
  lisbon: c(38.7223, -9.1393, 12),
  barcelona: c(41.3874, 2.1686, 14),
};

const key = (city: string): string =>
  city
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/,.*$/, "")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Words that only say which country or state a city is in: "Brooklyn NY", "Paris France", "Chicago Illinois". */
const REGION_WORDS = new Set(["ny", "nyc", "new", "york", "usa", "us", "united", "states", "america", "uk", "kingdom", "england", "france", "il", "illinois", "india", "mp", "madhya", "pradesh", "ca", "california", "tx", "texas", "wa", "washington", "ma", "massachusetts", "or", "oregon", "germany", "japan", "canada", "australia", "spain", "portugal", "netherlands"]);

/**
 * The built-in centre of a well-known city, or undefined. Needs no network. A trailing region ("Brooklyn, New York",
 * "Paris France") is ignored, so a request for Brooklyn gets Brooklyn's own centre and not Manhattan's.
 */
export function knownCentre(city: string): CityCentre | undefined {
  const k = key(city);
  if (KNOWN[k]) return KNOWN[k];
  const words = k.split(" ");
  for (let n = words.length - 1; n >= 1; n -= 1) {
    const hit = KNOWN[words.slice(0, n).join(" ")];
    if (hit && words.slice(n).every((w) => REGION_WORDS.has(w))) return hit;
  }
  return undefined;
}

/** Radius for a city whose size is only known from its bounding box (km across the longer side). */
export function radiusFromSpanKm(spanKm: number): number {
  if (!Number.isFinite(spanKm) || spanKm <= 0) return DEFAULT_RADIUS_KM;
  return Math.round(Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, spanKm * 0.75)));
}

export type CentreResolver = (city: string) => Promise<CityCentre | undefined>;

/** Built-in table first, then the optional lookup; never throws. */
export function createCentreResolver(lookup?: CentreResolver): CentreResolver {
  const cache = new Map<string, Promise<CityCentre | undefined>>();
  return (city) => {
    const known = knownCentre(city);
    if (known) return Promise.resolve(known);
    if (!lookup) return Promise.resolve(undefined);
    const k = key(city);
    const hit = cache.get(k);
    if (hit) return hit;
    const work = lookup(city).catch(() => undefined);
    cache.set(k, work);
    return work;
  };
}
