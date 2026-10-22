import type { Evidence, EvidenceEntity } from "../ledger";
import { distanceKm, isUnnamedArea, withHeatmapEntities } from "../summaries";
import type { GeoArea } from "@/lib/geo/nominatim";
import { raceValue, replaceEvidence, type PipelineCtx } from "./context";
import { nameAreaFromPlaces, type NearbyPlace } from "./areaNames";
import { ledgerEntities } from "./minimum";

/**
 * Hotspot naming. Qloo's heatmap cells carry coordinates and no name, so a name is found in this order, each step only for
 * the cells the one before could not name: the addresses of the nearest reference places (no network), reverse geocoding
 * (best effort, within a budget), and finally a neutral label ("Near <place>", "<direction> <city>"). A cell that lies in the
 * city is never hidden for lack of a name; only cells positively identified as an airport or industrial land are dropped.
 */

/** Hotspots shown per brief. */
export const MAX_HOTSPOTS = 5;
/** Cells whose reverse lookup starts as soon as the heatmap arrives, while the rest of the walk is still running. */
const PREFETCH_CELLS = 8;
/** Own time allowance for hotspot naming once the walk is over; the lookups started earlier are normally done by then. */
export const HOTSPOT_BUDGET_MS = 6_000;
/** Reference places this far from a cell (or less) may give it a neutral "Near ..." label. */
const NEAR_PLACE_KM = 4;

const NOTHING_NAMEABLE = "Every hotspot cell lay at an airport or on industrial land.";

const lower = (s: string): string => s.trim().toLowerCase();

/** A country or region is never a neighbourhood (a London cell once came back as "United Kingdom"). */
const WIDER_AREAS = new Set(["united kingdom", "united states", "england", "scotland", "wales", "greater london", "india", "france", "usa", "new york state", "illinois", "madhya pradesh", "ile-de-france", "île-de-france"]);

/** The bare city, "City of X" or "X City" says nothing about where in the city; "Brooklyn Heights" does. */
function isGenericCityName(name: string, city: string): boolean {
  const n = lower(name);
  const c = lower(city);
  return n === c || n === `${c} city` || n === `city of ${c}` || n === `${c} district` || n === `${c} division` || WIDER_AREAS.has(n);
}

function isSpecificName(name: string, city: string, taken: ReadonlySet<string>): boolean {
  return !isGenericCityName(name, city) && !taken.has(lower(name));
}

const cellKey = (lat: number, lon: number): string => `${lat.toFixed(4)},${lon.toFixed(4)}`;

/** The reverse lookup of a cell, started once per run and shared by the prefetch and the final naming. */
function areaOf(ctx: PipelineCtx, lat: number, lon: number): Promise<GeoArea | undefined> | undefined {
  if (!ctx.geocode) return undefined;
  const key = cellKey(lat, lon);
  const known = ctx.areas.get(key);
  if (known) return known;
  const started = Promise.resolve(ctx.geocode(lat, lon)).catch(() => undefined);
  ctx.areas.set(key, started);
  return started;
}

/** Starts the reverse lookups for the strongest cells so they run beside the rest of the walk. Never throws. */
export function prefetchAreas(ctx: PipelineCtx, heat: Evidence): void {
  for (const e of (heat.entities ?? []).slice(0, PREFETCH_CELLS)) {
    if (e.lat !== undefined && e.lon !== undefined) void areaOf(ctx, e.lat, e.lon);
  }
}

/** Top reference places with a position and a street address: what hotspots are named from. */
function placesWithAddress(ctx: PipelineCtx): NearbyPlace[] {
  return ledgerEntities(ctx.box.ledger, "place").flatMap(({ entity }) => {
    const address = ctx.facts.get(entity.id)?.address;
    return address && entity.lat !== undefined && entity.lon !== undefined ? [{ id: entity.id, lat: entity.lat, lon: entity.lon, address }] : [];
  });
}

function nearestPlaceName(ctx: PipelineCtx, e: EvidenceEntity, taken: ReadonlySet<string>): string | undefined {
  if (e.lat === undefined || e.lon === undefined) return undefined;
  const cell = { latitude: e.lat, longitude: e.lon };
  const near = ledgerEntities(ctx.box.ledger, "place")
    .flatMap(({ entity }) => (entity.lat !== undefined && entity.lon !== undefined ? [{ name: entity.name, km: distanceKm(cell, { latitude: entity.lat, longitude: entity.lon }) }] : []))
    .filter((p) => p.km <= NEAR_PLACE_KM && !taken.has(lower(`Near ${p.name}`)))
    .sort((a, b) => a.km - b.km || a.name.localeCompare(b.name))[0];
  return near ? `Near ${near.name}` : undefined;
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "North-west Chicago, about 8 km out" from the offset note the heatmap draft wrote ("north-west of the Chicago centre, about 8 km out"). */
function directionLabel(e: EvidenceEntity, city: string): string {
  const note = /^([a-z-]+) of the .* centre, about (\d+) km out/.exec(e.note ?? "");
  if (note) return `${capital(note[1])} ${city}, about ${note[2]} km out`;
  return /^central /.test(e.note ?? "") ? `Central ${city}` : `Part of ${city} (${e.lat?.toFixed(2)}, ${e.lon?.toFixed(2)})`;
}

/** What the reverse lookup of a cell says, waiting for it until `until`. No answer in time is no answer: the cell stays. */
async function lookup(ctx: PipelineCtx, e: EvidenceEntity, until: number): Promise<GeoArea | undefined> {
  if (e.lat === undefined || e.lon === undefined || !ctx.geocode) return undefined;
  const remaining = until - Date.now();
  // Past the allowance only lookups that already exist count; none is started.
  const work = remaining > 0 ? areaOf(ctx, e.lat, e.lon) : ctx.areas.get(cellKey(e.lat, e.lon));
  return work ? raceValue(work, Math.max(0, remaining)) : undefined;
}

/** Names the cells of one heatmap record and keeps up to five. */
async function nameCells(ctx: PipelineCtx, heat: Evidence, city: string, until: number): Promise<void> {
  const candidates = (heat.entities ?? []).filter((e) => e.lat !== undefined && e.lon !== undefined);
  if (candidates.length === 0) return;
  const places = placesWithAddress(ctx);
  const kept: EvidenceEntity[] = [];
  for (const e of candidates) {
    if (kept.length === MAX_HOTSPOTS) break;
    const area = await lookup(ctx, e, until);
    if (area && !area.residential) continue;
    const taken = new Set(kept.map((k) => lower(k.name)));
    const own = isUnnamedArea(e.name) ? undefined : e.name;
    const name =
      own ??
      nameAreaFromPlaces({ lat: e.lat as number, lon: e.lon as number }, places, city, taken) ??
      (area && isSpecificName(area.name, city, taken) ? area.name : undefined) ??
      nearestPlaceName(ctx, e, taken) ??
      directionLabel(e, city);
    // Two cells can share a direction and distance; the second keeps its own label by its position.
    const unique = taken.has(lower(name)) ? `${name} (${e.lat?.toFixed(3)}, ${e.lon?.toFixed(3)})` : name;
    kept.push({ ...e, name: unique });
  }
  replaceEvidence(ctx, withHeatmapEntities(heat, kept, NOTHING_NAMEABLE));
}

/**
 * Gives every heatmap record's cells their final names. Runs after the walk with its own budget (so the walk's soft
 * deadline cannot cost the brief its hotspots) and again, with no budget, right before the run is closed. Never throws.
 */
export async function finalizeHotspots(ctx: PipelineCtx, city: string | undefined, budgetMs: number): Promise<void> {
  if (!city) return;
  const until = Date.now() + budgetMs;
  for (const heat of ctx.box.ledger.records.filter((r) => r.endpoint.includes("heatmap") && (r.entities?.length ?? 0) > 0)) {
    try {
      await nameCells(ctx, heat, city, until);
    } catch {
      // A naming failure must not cost the brief its map; the cells keep their placeholder names and are labelled at close.
    }
  }
}
