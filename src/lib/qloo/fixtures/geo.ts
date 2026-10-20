/** SYNTHETIC mock heatmap, demographics and trending data (all values invented). */

type Spot = { geohash: string; name: string; latitude: number; longitude: number; affinity: number; rank: number; popularity: number };

const spot = (geohash: string, name: string, latitude: number, longitude: number, affinity: number, popularity: number): Spot => ({
  geohash,
  name,
  latitude,
  longitude,
  affinity,
  rank: Math.min(0.99, affinity - 0.02),
  popularity,
});

const BROOKLYN: Spot[] = [
  spot("dr5ru7", "Williamsburg", 40.7081, -73.9571, 1, 0.9),
  spot("dr5rsk", "Park Slope", 40.671, -73.9777, 0.93, 0.7),
  spot("dr5rgq", "Greenpoint", 40.7304, -73.9515, 0.88, 0.82),
  spot("dr5x1n", "Bushwick", 40.6944, -73.9213, 0.74, 0.55),
  spot("dr5rvb", "Bedford-Stuyvesant", 40.6872, -73.9418, 0.61, 0.4),
];

// Approximate neighbourhood centres, invented affinities (SYNTHETIC).
const INDORE: Spot[] = [
  spot("ts7h0k", "Vijay Nagar", 22.7533, 75.8937, 1, 0.9),
  spot("ts7h08", "Palasia", 22.7244, 75.8839, 0.94, 0.85),
  spot("ts7h02", "Rajwada", 22.718, 75.8554, 0.86, 0.8),
  spot("ts7h1p", "Saket Nagar", 22.7155, 75.897, 0.75, 0.5),
  spot("ts7gv9", "Bhawarkuan", 22.6906, 75.8688, 0.63, 0.45),
];

const LONDON: Spot[] = [
  spot("gcpvn4", "Shoreditch", 51.5265, -0.0786, 1, 0.92),
  spot("gcpvq1", "Hackney", 51.545, -0.0553, 0.92, 0.8),
  spot("gcpuz8", "Peckham", 51.474, -0.069, 0.85, 0.66),
  spot("gcpuxe", "Brixton", 51.4613, -0.1156, 0.73, 0.6),
  spot("gcpvj8", "Camden Town", 51.539, -0.1426, 0.62, 0.7),
];

/** Cities with mock coverage; any other (covered) city falls back to the Brooklyn set. */
const MOCK_CITIES: readonly { pattern: RegExp; spots: Spot[] }[] = [
  { pattern: /indore/i, spots: INDORE },
  { pattern: /london/i, spots: LONDON },
];

const toRawCell = (c: Spot, named: boolean) => ({
  location: {
    latitude: c.latitude,
    longitude: c.longitude,
    geohash: c.geohash,
    ...(named ? { name: c.name } : {}),
  },
  query: { affinity: c.affinity, affinity_rank: c.rank, popularity: c.popularity },
});

/** Heatmap cells for a location; `named` mimics `output.heatmap.boundary=neighborhood`. */
export function mockHeatmap(location: string, named: boolean) {
  const spots = MOCK_CITIES.find((c) => c.pattern.test(location))?.spots ?? BROOKLYN;
  return spots.map((s) => toRawCell(s, named));
}

export function mockDemographics(ids: readonly string[]) {
  return ids.map((id, i) => ({
    entity_id: id,
    query: {
      age: {
        "24_and_younger": 0.1 - i * 0.05,
        "25_to_29": 0.42,
        "30_to_34": 0.31,
        "35_to_44": 0.02,
        "45_to_54": -0.25,
        "55_and_older": -0.3,
      },
      gender: { male: -0.04, female: 0.04 },
    },
  }));
}

/** Weekly points, newest first, anchored on the requested end date. */
export function mockTrending(endDate: string, weeks: number) {
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Array.from({ length: weeks }, (_, i) => ({
    date: new Date(end - i * 7 * 86_400_000).toISOString().slice(0, 10),
    population_percentile: 80 + (weeks - i) * 1.5,
    population_rank: 200 - (weeks - i) * 6,
    population_rank_velocity: 4,
    velocity_fold_change: 1.1,
    population_percent_delta: 0.4,
  }));
}
