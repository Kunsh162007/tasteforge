import type { Brief, Evidence } from "./contract";

/** Map-ready hotspots, read from the heatmap evidence behind the brief's "where they are" section. */

export type Hotspot = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Qloo affinity 0..1 for the audience in this area. */
  affinity: number;
  /** True when the brief itself lists this area. */
  listed: boolean;
};

export function hotspotsFromBrief(brief: Brief, evidence: Readonly<Record<string, Evidence>>): Hotspot[] {
  const where = brief.whereTheyAre;
  if (!where) return [];
  const listedIds = new Set(where.hotspots.flatMap((h) => (h.qlooId ? [h.qlooId] : [])));
  const listedNames = new Set(where.hotspots.map((h) => h.label.toLowerCase()));
  const evidenceIds = [...new Set(where.hotspots.flatMap((h) => h.evidence))];
  const seen = new Set<string>();
  const spots: Hotspot[] = [];
  for (const id of evidenceIds) {
    const record = evidence[id];
    if (!record || !record.endpoint.includes("heatmap")) continue;
    for (const e of record.entities ?? []) {
      if (e.lat === undefined || e.lon === undefined || seen.has(e.id)) continue;
      seen.add(e.id);
      spots.push({
        id: e.id,
        name: e.name,
        lat: e.lat,
        lon: e.lon,
        affinity: e.affinity ?? 0.5,
        listed: listedIds.has(e.id) || listedNames.has(e.name.toLowerCase()),
      });
    }
  }
  return spots.sort((a, b) => b.affinity - a.affinity);
}

/** Circle radius in pixels: bigger for stronger concentration, within a readable range. */
export function circleRadius(affinity: number, min = 9, max = 30): number {
  const a = Math.max(0, Math.min(1, affinity));
  return Math.round(min + (max - min) * a);
}

export const hotspotLabel = (spot: Hotspot): string => `${spot.name} (${Math.round(spot.affinity * 100)}% match)`;
