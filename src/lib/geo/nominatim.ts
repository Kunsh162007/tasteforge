/**
 * Reverse geocoding through OpenStreetMap Nominatim, used to name heatmap hotspots when Qloo only returns
 * coordinates. Usage policy: at most 1 request per second, an identifying User-Agent, and caching, so
 * requests run through one serial queue and results are cached by rounded coordinates.
 * https://operations.osmfoundation.org/policies/nominatim/
 */

/** What a reverse lookup says about a spot: its local area name, and whether it is somewhere people live and gather. */
export type GeoArea = { readonly name: string; readonly residential: boolean };

export type ReverseGeocoder = (lat: number, lon: number) => Promise<GeoArea | undefined>;

export type NominatimOptions = {
  readonly fetchImpl?: typeof fetch;
  readonly userAgent?: string;
  readonly minIntervalMs?: number;
  readonly timeoutMs?: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
};

const ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
const DEFAULT_USER_AGENT = "TasteForge/0.1 (Qloo hackathon demo; https://github.com/tasteforge)";
const DEFAULT_INTERVAL_MS = 1_100;
const DEFAULT_TIMEOUT_MS = 4_000;
const COORD_DECIMALS = 3;
/** Neighbourhood-level zoom: returns suburb/neighbourhood rather than street or city. */
const ZOOM = 14;
const MAX_LAT = 90;
const MAX_LON = 180;
const URL_DECIMALS = 6;

const clamp = (n: number, limit: number): number => Math.min(limit, Math.max(-limit, n));
/** At most six decimals, never an exponent: keeps hostile numbers out of the request URL. */
const urlNumber = (n: number): number => Number(n.toFixed(URL_DECIMALS));

const ADDRESS_KEYS = ["neighbourhood", "suburb", "quarter", "city_district", "borough", "village", "town", "city"] as const;

/** The most local named area in a Nominatim address object. */
export function pickAreaName(address: Readonly<Record<string, unknown>> | undefined): string | undefined {
  if (!address) return undefined;
  // Nominatim sometimes files a whole country or state under "city" (a London cell came back as "United Kingdom").
  const wider = new Set(["country", "state", "county", "region"].flatMap((k) => (typeof address[k] === "string" ? [(address[k] as string).trim().toLowerCase()] : [])));
  for (const key of ADDRESS_KEYS) {
    const value = address[key];
    if (typeof value === "string" && value.trim() !== "" && !wider.has(value.trim().toLowerCase())) return value.trim();
  }
  return undefined;
}

/** Land uses and features that are not neighbourhoods: an audience does not live on a runway or in a rail yard. */
const NON_RESIDENTIAL_CATEGORIES = new Set(["aeroway", "military", "industrial", "railway", "harbour", "man_made"]);
const NON_RESIDENTIAL_LANDUSE = new Set(["industrial", "commercial", "retail", "railway", "military", "quarry", "port", "garages", "landfill"]);
const AIRPORT_NAME = /\b(airport|airfield|aerodrome|airbase|o'hare|heathrow|gatwick|stansted|luton|laguardia|jfk)\b/i;

type NominatimBody = { readonly category?: unknown; readonly type?: unknown; readonly name?: unknown; readonly address?: Record<string, unknown> };

/** Whether the spot a reverse lookup describes is residential or at least a public district (not an airport or industrial land). */
export function isResidentialArea(body: NominatimBody, name: string): boolean {
  const category = typeof body.category === "string" ? body.category : "";
  const type = typeof body.type === "string" ? body.type : "";
  if (NON_RESIDENTIAL_CATEGORIES.has(category)) return false;
  if (category === "landuse" && NON_RESIDENTIAL_LANDUSE.has(type)) return false;
  if (["aerodrome", "airport", "terminal", "runway", "industrial"].includes(type)) return false;
  if (AIRPORT_NAME.test(name) || (typeof body.name === "string" && AIRPORT_NAME.test(body.name))) return false;
  const address = body.address ?? {};
  return !("aeroway" in address) && !("industrial" in address);
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createNominatimGeocoder(o: NominatimOptions = {}): ReverseGeocoder {
  const fetchImpl = o.fetchImpl ?? fetch;
  const userAgent = o.userAgent ?? DEFAULT_USER_AGENT;
  const interval = o.minIntervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? defaultSleep;
  const cache = new Map<string, GeoArea>();
  const inflight = new Map<string, Promise<GeoArea | undefined>>();
  let tail: Promise<unknown> = Promise.resolve();
  let lastAt: number | undefined;

  async function request(lat: number, lon: number): Promise<GeoArea | undefined> {
    if (lastAt !== undefined) {
      const wait = lastAt + interval - now();
      if (wait > 0) await sleep(wait);
    }
    lastAt = now();
    const url = `${ENDPOINT}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=${ZOOM}&addressdetails=1&accept-language=en`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { headers: { "User-Agent": userAgent, Accept: "application/json" }, signal: controller.signal });
      if (!res.ok) return undefined;
      const body = (await res.json()) as NominatimBody;
      const name = pickAreaName(body.address);
      return name ? { name, residential: isResidentialArea(body, name) } : undefined;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  return (rawLat, rawLon) => {
    if (!Number.isFinite(rawLat) || !Number.isFinite(rawLon)) return Promise.resolve(undefined);
    const lat = urlNumber(clamp(rawLat, MAX_LAT));
    const lon = urlNumber(clamp(rawLon, MAX_LON));
    const key = `${lat.toFixed(COORD_DECIMALS)},${lon.toFixed(COORD_DECIMALS)}`;
    const hit = cache.get(key);
    if (hit !== undefined) return Promise.resolve(hit);
    const pending = inflight.get(key);
    if (pending) return pending;
    const run = tail.then(() => request(lat, lon));
    tail = run.catch(() => undefined);
    const tracked = run
      .then((name) => {
        if (name) cache.set(key, name);
        return name;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, tracked);
    return tracked;
  };
}

let shared: ReverseGeocoder | undefined;

/** Process-wide instance so the 1 request/second limit holds across concurrent briefs. */
export function getSharedGeocoder(): ReverseGeocoder {
  shared ??= createNominatimGeocoder({ userAgent: process.env.NOMINATIM_USER_AGENT || undefined });
  return shared;
}
