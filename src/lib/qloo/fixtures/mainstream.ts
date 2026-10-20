/**
 * SYNTHETIC mock affinities for well-known mainstream names, so the Taste Proof comparison has
 * realistic "the LLM guessed popular names" picks to score. Names are public brand/artist names
 * only; the affinity numbers are invented and are not Qloo data. These entities are reachable via
 * search and `filter.results.entities` but never appear in ordinary insight lists.
 */
import type { RawEntity } from "./entities";

const make = (type: string, prefix: string, rows: readonly (readonly [string, number])[]): RawEntity[] =>
  rows.map(([name, affinity], i) => ({
    entity_id: `MOCK-MAIN-${prefix}-${i + 1}`,
    name,
    subtype: `urn:entity:${type}`,
    popularity: 0.95 - i * 0.02,
    affinity,
    tags: [],
    properties: { description: "Synthetic mock mainstream entity." },
  }));

export const MAINSTREAM_ENTITIES: RawEntity[] = [
  ...make("artist", "ARTIST", [
    ["Taylor Swift", 0.21],
    ["Coldplay", 0.33],
    ["Ed Sheeran", 0.27],
    ["Billie Eilish", 0.38],
    ["Radiohead", 0.52],
    ["Phoebe Bridgers", 0.47],
    ["Bon Iver", 0.44],
    ["Fleet Foxes", 0.41],
    ["Mac DeMarco", 0.36],
    ["Norah Jones", 0.31],
    ["Miles Davis", 0.29],
    ["Lana Del Rey", 0.34],
    ["Arijit Singh", 0.29],
    ["A.R. Rahman", 0.33],
    ["Prateek Kuhad", 0.58],
    ["Ritviz", 0.41],
  ]),
  ...make("brand", "BRAND", [
    ["Starbucks", 0.24],
    ["Nike", 0.19],
    ["Apple", 0.22],
    ["IKEA", 0.37],
    ["Zara", 0.28],
    ["Spotify", 0.35],
    ["Patagonia", 0.42],
    ["Muji", 0.46],
    ["Levi's", 0.3],
    ["Fabindia", 0.44],
    ["Tata", 0.18],
    ["Amul", 0.16],
  ]),
  ...make("place", "PLACE", [
    ["Starbucks Reserve", 0.2],
    ["Blue Bottle Coffee", 0.39],
    ["The Cheesecake Factory", 0.14],
    ["Shake Shack", 0.26],
    ["Joe Coffee", 0.35],
    ["Dunkin", 0.12],
    ["Chaayos", 0.31],
    ["Cafe Coffee Day", 0.17],
    ["Starbucks Indore", 0.19],
  ]),
];
