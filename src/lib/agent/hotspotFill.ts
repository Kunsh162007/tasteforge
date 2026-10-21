import type { Brief, Item } from "./brief";
import type { Ledger } from "./ledger";
import { isUnnamedArea } from "./summaries";

/**
 * The hotspots are Qloo's own named cells, so when the writer leaves the section out (a Paris brief once came back with
 * named arrondissements in its evidence and none in its "where they are"), they are listed straight from the evidence.
 */

export const FILLED_HOTSPOTS = 5;

export function fillHotspots(brief: Brief, ledger: Ledger, city: string | undefined): Brief {
  if (!city || (brief.whereTheyAre?.hotspots.length ?? 0) > 0) return brief;
  const record = ledger.records.find((r) => r.endpoint.includes("heatmap") && (r.entities ?? []).some((e) => !isUnnamedArea(e.name)));
  if (!record) return brief;
  const hotspots: Item[] = (record.entities ?? [])
    .filter((e) => !isUnnamedArea(e.name))
    .slice(0, FILLED_HOTSPOTS)
    .map((e) => ({ label: e.name, ...(e.note ? { detail: e.note } : {}), evidence: [record.id], qlooId: e.id }));
  return { ...brief, whereTheyAre: { city: brief.whereTheyAre?.city ?? city, hotspots } };
}
