/**
 * SYNTHETIC mock data. Every name here is invented and clearly fake; nothing is
 * copied from Qloo. Shapes mimic real /v2/insights entity payloads.
 */

export type RawTag = { id: string; name: string; type: string };

export type RawEntity = {
  entity_id: string;
  name: string;
  subtype: string;
  popularity: number;
  affinity: number;
  tags: RawTag[];
  properties: Record<string, unknown>;
  location?: { lat: number; lon: number };
};

const tag = (type: string, slug: string, name: string): RawTag => ({
  id: `${type}:${slug}`,
  name,
  type,
});

export const decor = (slug: string, name: string) => tag("urn:tag:decor:qloo", slug, name);
export const ambience = (slug: string, name: string) => tag("urn:tag:ambience:qloo", slug, name);
export const genre = (slug: string, name: string) => tag("urn:tag:genre:media", slug, name);
export const cuisine = (slug: string, name: string) => tag("urn:tag:genre:place:restaurant", slug, name);

const artist = (n: number, name: string, affinity: number, tags: RawTag[]): RawEntity => ({
  entity_id: `MOCK-ARTIST-${n}`,
  name,
  subtype: "urn:entity:artist",
  popularity: 0.5 + n / 20,
  affinity,
  tags,
  properties: { description: "Synthetic mock artist for demos." },
});

const place = (
  n: number,
  name: string,
  affinity: number,
  priceLevel: number,
  where: { lat: number; lon: number },
  tags: RawTag[],
): RawEntity => ({
  entity_id: `MOCK-PLACE-${n}`,
  name,
  subtype: "urn:entity:place",
  popularity: 0.4 + n / 15,
  affinity,
  tags,
  location: where,
  properties: { description: "Synthetic mock venue.", price_level: priceLevel },
});

const brand = (n: number, name: string, affinity: number, tags: RawTag[]): RawEntity => ({
  entity_id: `MOCK-BRAND-${n}`,
  name,
  subtype: "urn:entity:brand",
  popularity: 0.45 + n / 18,
  affinity,
  tags,
  properties: { description: "Synthetic mock brand." },
});

const generic = (prefix: string, subtype: string, names: string[]): RawEntity[] =>
  names.map((name, i) => ({
    entity_id: `MOCK-${prefix}-${i + 1}`,
    name,
    subtype,
    popularity: 0.6 - i * 0.05,
    affinity: 0.9 - i * 0.08,
    tags: [genre("dreamy", "Dreamy"), genre("arthouse", "Arthouse")],
    properties: { description: "Synthetic mock entry." },
  }));

export const ARTISTS: RawEntity[] = [
  artist(1, "Velvet Static (band)", 0.94, [genre("dream_pop", "Dream Pop"), genre("indie", "Indie")]),
  artist(2, "Paper Lanterns (band)", 0.9, [genre("indie_folk", "Indie Folk")]),
  artist(3, "Moth Choir (band)", 0.86, [genre("shoegaze", "Shoegaze"), genre("indie", "Indie")]),
  artist(4, "Halcyon Drive (band)", 0.81, [genre("synthwave", "Synthwave")]),
  artist(5, "Low Tide Radio (band)", 0.77, [genre("lofi", "Lo-fi")]),
  artist(6, "Midnight Brass Quartet (band)", 0.74, [genre("jazz", "Jazz"), genre("instrumental", "Instrumental")]),
  artist(7, "Kettle Drum Collective (band)", 0.71, [genre("folk_world", "World Folk"), genre("indie", "Indie")]),
];

const BK = { lat: 40.69, lon: -73.96 };
export const PLACES: RawEntity[] = [
  place(1, "Cafe Lumen", 0.95, 2, { lat: BK.lat + 0.01, lon: BK.lon + 0.01 }, [
    decor("industrial", "Industrial"),
    decor("exposed_brick", "Exposed Brick"),
    ambience("cozy", "Cozy"),
    cuisine("coffee", "Coffee"),
  ]),
  place(2, "Brick & Bloom (bar)", 0.9, 3, { lat: BK.lat - 0.02, lon: BK.lon + 0.02 }, [
    decor("botanical", "Botanical"),
    decor("exposed_brick", "Exposed Brick"),
    ambience("intimate", "Intimate"),
    cuisine("cocktails", "Cocktails"),
  ]),
  place(3, "Quiet Orbit Records (cafe)", 0.87, 1, { lat: BK.lat + 0.03, lon: BK.lon - 0.01 }, [
    decor("vintage", "Vintage"),
    ambience("quiet", "Quiet"),
    cuisine("coffee", "Coffee"),
  ]),
  place(4, "The Salt Annex (restaurant)", 0.82, 4, { lat: BK.lat, lon: BK.lon - 0.03 }, [
    decor("minimalist", "Minimalist"),
    ambience("lively", "Lively"),
    cuisine("seafood", "Seafood"),
  ]),
  place(5, "Tin Roof Kitchen (restaurant)", 0.78, 2, { lat: BK.lat - 0.04, lon: BK.lon }, [
    decor("rustic", "Rustic"),
    ambience("lively", "Lively"),
    ambience("loud", "Loud"),
    cuisine("southern", "Southern"),
  ]),
  place(6, "Kiln & Kettle (cafe)", 0.76, 2, { lat: BK.lat + 0.02, lon: BK.lon + 0.03 }, [
    decor("ceramic", "Ceramic"),
    decor("wabi_sabi", "Wabi-Sabi"),
    ambience("slow_living", "Slow Living"),
    cuisine("japanese", "Japanese"),
    cuisine("coffee", "Coffee"),
  ]),
  place(7, "Saigon Alley Kitchen (restaurant)", 0.72, 2, { lat: BK.lat - 0.03, lon: BK.lon + 0.04 }, [
    decor("lantern", "Lantern-lit"),
    ambience("lively", "Lively"),
    cuisine("vietnamese", "Vietnamese"),
  ]),
  place(8, "Blue Hour Cellar (bar)", 0.69, 3, { lat: BK.lat + 0.04, lon: BK.lon + 0.02 }, [
    decor("velvet", "Velvet"),
    ambience("intimate", "Intimate"),
    cuisine("cocktails", "Cocktails"),
    genre("jazz", "Jazz"),
  ]),
];

export const BRANDS: RawEntity[] = [
  brand(1, "Fernwick Goods (brand)", 0.92, [tag("urn:tag:genre:brand", "home", "Home Goods")]),
  brand(2, "Maple & Ash Coffee Co (brand)", 0.88, [
    tag("urn:tag:genre:brand", "food_beverage", "Food & Beverage"),
  ]),
  brand(3, "Northbound Denim (brand)", 0.8, [tag("urn:tag:genre:brand", "apparel", "Apparel")]),
];

export const OTHER_ENTITIES: Record<string, RawEntity[]> = {
  "urn:entity:movie": generic("MOVIE", "urn:entity:movie", [
    "The Lantern Year (film)",
    "Salt Meridian (film)",
    "Small Hours (film)",
  ]),
  "urn:entity:tv_show": generic("TV", "urn:entity:tv_show", ["Harbor Lights (series)", "Quiet Hours (series)"]),
  "urn:entity:book": generic("BOOK", "urn:entity:book", ["A Map of Small Rooms (novel)", "Tidewater (novel)"]),
  "urn:entity:podcast": generic("POD", "urn:entity:podcast", ["Late Night Cartography (podcast)"]),
  "urn:entity:videogame": generic("GAME", "urn:entity:videogame", ["Kettle Valley (game)"]),
  "urn:entity:person": generic("PERSON", "urn:entity:person", ["Iris Calloway (fictional person)"]),
  "urn:entity:destination": generic("DEST", "urn:entity:destination", ["Port Mirabel (fictional town)"]),
};

export const ENTITIES_BY_TYPE: Record<string, RawEntity[]> = {
  "urn:entity:artist": ARTISTS,
  "urn:entity:place": PLACES,
  "urn:entity:brand": BRANDS,
  ...OTHER_ENTITIES,
};

export const ALL_ENTITIES: RawEntity[] = Object.values(ENTITIES_BY_TYPE).flat();
