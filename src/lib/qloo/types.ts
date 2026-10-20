/** Entity type URNs accepted by /v2/insights `filter.type` (hackathon developer guide). */
export const ENTITY_TYPES = {
  artist: "urn:entity:artist",
  book: "urn:entity:book",
  brand: "urn:entity:brand",
  // verified live 2026-10-20: `destination` is accepted by insights.
  destination: "urn:entity:destination",
  movie: "urn:entity:movie",
  person: "urn:entity:person",
  place: "urn:entity:place",
  podcast: "urn:entity:podcast",
  tvShow: "urn:entity:tv_show",
  // verified live 2026-10-20: the API spells it `videogame`; `video_game` is rejected with HTTP 400.
  videoGame: "urn:entity:videogame",
} as const;

export type EntityTypeUrn = (typeof ENTITY_TYPES)[keyof typeof ENTITY_TYPES];

/** Special `filter.type` values that switch the insights response shape. */
export const SPECIAL_TYPES = {
  demographics: "urn:demographics",
  tag: "urn:tag",
  heatmap: "urn:heatmap",
} as const;

export type QlooMode = "mock" | "live";

export type QlooConfig = {
  readonly mode: QlooMode;
  readonly apiKey?: string;
  readonly baseUrl: string;
};

// ---- Request params -------------------------------------------------------

export type SearchParams = {
  readonly query: string;
  readonly types?: readonly string[];
  readonly take?: number;
};

export type TagSearchParams = {
  readonly query: string;
  readonly tagTypes?: readonly string[];
  readonly take?: number;
};

export type InsightsParams = {
  readonly type: EntityTypeUrn;
  readonly entities?: readonly string[];
  readonly tags?: readonly string[];
  readonly locationQuery?: string;
  readonly filterTags?: readonly string[];
  readonly excludeTags?: readonly string[];
  /** filter.exclude.entities: entity ids that must not be returned (refine loop). */
  readonly excludeEntities?: readonly string[];
  readonly priceMin?: number;
  readonly priceMax?: number;
  readonly explainability?: boolean;
  /** Qloo ranks only this shortlist (filter.results.entities): used to score arbitrary picks. */
  readonly resultsEntities?: readonly string[];
  readonly take?: number;
};

export type DemographicsParams = {
  readonly entities?: readonly string[];
  readonly tags?: readonly string[];
};

export type EntityTagsParams = {
  readonly entities: readonly string[];
  readonly tagTypes?: readonly string[];
  readonly parentTypes?: readonly string[];
  readonly take?: number;
};

export type HeatmapParams = {
  readonly locationQuery: string;
  readonly entities?: readonly string[];
  readonly tags?: readonly string[];
};

export type TrendingParams = {
  readonly type: EntityTypeUrn;
  readonly entities: readonly string[];
  readonly startDate: string; // YYYY-MM-DD
  readonly endDate: string; // YYYY-MM-DD
  readonly take?: number;
};

// ---- Normalized responses -------------------------------------------------

export type QlooTag = {
  readonly id: string;
  readonly name: string;
  readonly type?: string;
  readonly score?: number;
  /** Entity kinds the tag applies to (`parents` in tag search, e.g. ["place", "brand"]); absent elsewhere. */
  readonly entityTypes?: readonly string[];
};

export type QlooLocation = { readonly latitude: number; readonly longitude: number };

export type QlooEntity = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly affinity?: number;
  readonly popularity?: number;
  /** One-line facts (address, price, style...) distilled from `properties`. */
  readonly note?: string;
  readonly image?: string;
  readonly tags?: readonly QlooTag[];
  readonly location?: QlooLocation;
  readonly properties?: Readonly<Record<string, unknown>>;
};

export type HeatmapCell = {
  readonly geohash: string;
  /** Area name, when the source carries one (the live API returns bare geohash cells). */
  readonly name?: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly affinity: number;
  readonly affinityRank?: number;
  readonly popularity?: number;
};

export type Demographics = {
  readonly entityId: string;
  readonly age: Readonly<Record<string, number>>;
  readonly gender: Readonly<Record<string, number>>;
};

export type TrendPoint = {
  /** Set by the client, which asks for one entity per request. */
  readonly entityId?: string;
  readonly date: string;
  readonly populationPercentile?: number;
  readonly populationRank?: number;
  readonly rankVelocity?: number;
  readonly velocityFoldChange?: number;
  readonly percentDelta?: number;
};

/** Every client method resolves to data plus an optional warning (e.g. empty results). */
export type QlooResult<T> = { readonly data: readonly T[]; readonly warning?: string };
