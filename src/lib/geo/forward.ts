import { radiusFromSpanKm, type CityCentre } from "@/lib/agent/cityCentre";
import { distanceKm } from "@/lib/agent/summaries";

/**
 * Forward geocoding of a city name through OpenStreetMap Nominatim, only for cities the built-in table does not know.
 * The result is the city's centre and a radius taken from its bounding box. Same usage policy as the reverse lookup
 * (identifying User-Agent); it is called at most once per unknown city and the resolver caches the answer.
 */

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "TasteForge/0.1 (Qloo hackathon demo; https://github.com/tasteforge)";
const TIMEOUT_MS = 4_000;

type Hit = { readonly lat?: string; readonly lon?: string; readonly boundingbox?: readonly string[] };

export async function lookupCityCentre(city: string, fetchImpl: typeof fetch = fetch): Promise<CityCentre | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${ENDPOINT}?format=jsonv2&limit=1&accept-language=en&q=${encodeURIComponent(city)}`;
    const res = await fetchImpl(url, { headers: { "User-Agent": process.env.NOMINATIM_USER_AGENT || USER_AGENT, Accept: "application/json" }, signal: controller.signal });
    if (!res.ok) return undefined;
    const hit = ((await res.json()) as Hit[])[0];
    const lat = Number(hit?.lat);
    const lon = Number(hit?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
    const [south, north, west, east] = (hit?.boundingbox ?? []).map(Number);
    const span = [south, north, west, east].every(Number.isFinite)
      ? Math.max(distanceKm({ latitude: south, longitude: west }, { latitude: north, longitude: west }), distanceKm({ latitude: south, longitude: west }, { latitude: south, longitude: east }))
      : 0;
    return { lat, lon, radiusKm: radiusFromSpanKm(span) };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
