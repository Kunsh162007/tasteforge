import type { DroppedItem, Evidence, TasteProof, Brief } from "../contract";

/** Synthetic data only. Not Qloo output; used for ?demo=1 and tests. */

export const sampleEvidence: readonly Evidence[] = [
  {
    id: "ev_1",
    endpoint: "/v2/insights",
    params: { "filter.type": "urn:entity:artist", "signal.interests.entities": "Radiohead,A24", take: "10" },
    summary: "10 artists with strong overlap for this audience",
    entities: [
      { id: "ent_a1", name: "Mitski", affinity: 0.91 },
      { id: "ent_a2", name: "Bon Iver", affinity: 0.88 },
      { id: "ent_a3", name: "Big Thief", affinity: 0.84 },
      { id: "ent_a4", name: "Jon Hopkins", affinity: 0.79 },
    ],
  },
  {
    id: "ev_2",
    endpoint: "/v2/insights",
    params: { "filter.type": "urn:entity:place", "filter.location.query": "Brooklyn", take: "12" },
    summary: "12 places loved by this audience in Brooklyn",
    entities: [
      { id: "ent_p1", name: "Sunday Lantern Cafe", affinity: 0.93 },
      { id: "ent_p2", name: "Pho Hollow", affinity: 0.89 },
      { id: "ent_p3", name: "The Quiet Reel", affinity: 0.85 },
    ],
  },
  {
    id: "ev_3",
    endpoint: "/v2/tags (entity tags)",
    params: { "tag_types": "urn:tag:decor:qloo,urn:tag:ambience:qloo" },
    summary: "Decor and ambience tags shared by the top places",
    tags: [
      { id: "tag_d1", name: "Warm wood interiors", score: 0.9 },
      { id: "tag_d2", name: "Dim, low lighting", score: 0.86 },
      { id: "tag_d3", name: "Exposed brick", score: 0.74 },
      { id: "tag_d4", name: "Plants everywhere", score: 0.69 },
    ],
  },
  {
    id: "ev_4",
    endpoint: "/v2/insights",
    params: { "filter.type": "urn:entity:brand", take: "8" },
    summary: "8 brands that overlap with this audience",
    entities: [
      { id: "ent_b1", name: "Criterion Collection", affinity: 0.87 },
      { id: "ent_b2", name: "Aesop", affinity: 0.82 },
    ],
  },
  {
    id: "ev_5",
    endpoint: "/v2/insights (heatmap)",
    params: { "signal.demographics": "true", "filter.location.query": "Brooklyn" },
    summary: "Highest density in Williamsburg, Greenpoint and Bed-Stuy",
    entities: [
      { id: "ent_h1", name: "Williamsburg", affinity: 0.92 },
      { id: "ent_h2", name: "Greenpoint", affinity: 0.88 },
      { id: "ent_h3", name: "Bed-Stuy", affinity: 0.8 },
    ],
  },
  {
    id: "ev_6",
    endpoint: "/v2/insights (demographics)",
    params: { "signal.interests.entities": "Radiohead,A24" },
    summary: "Skews 25 to 34, slightly female, urban",
    tags: [
      { id: "dem_1", name: "Age 25 to 34", score: 0.71 },
      { id: "dem_2", name: "Age 35 to 44", score: 0.52 },
    ],
  },
];

export const sampleBrief: Brief = {
  title: "A slow Sunday for two: the dimly lit, film-literate Brooklyn couple",
  mode: "know_audience",
  groundingScore: 0.88,
  sectionConfidence: { audience: "high", aesthetic: "high", sound: "high", pairings: "medium", where: "medium" },
  audienceProfile: {
    summary:
      "Partners in their late twenties to mid thirties who treat a night out as a small ritual: a quiet film, a long dinner, a record that sounds better the second time. They prize craft over spectacle and would rather queue for a good bowl of pho than book a trendy tasting menu.",
    affinities: [
      { label: "A24 films", detail: "Strongest overlap with the supplied seed", evidence: ["ev_1"] },
      { label: "Radiohead and moody art-rock", evidence: ["ev_1"] },
      { label: "Vietnamese and other regional Asian kitchens", evidence: ["ev_2"] },
      { label: "Independent cinemas", evidence: ["ev_2"] },
    ],
    demographics: [
      { label: "Ages 25 to 34 lead", detail: "Followed by 35 to 44", evidence: ["ev_6"] },
      { label: "Urban, renting, no car", evidence: ["ev_6"] },
    ],
  },
  aesthetic: {
    palette: [
      { label: "Lantern amber", hex: "#C98B3E", evidence: ["ev_3"], tags: ["Warm", "Cozy"], role: "accent" },
      { label: "Brick ember", hex: "#8E4A3A", evidence: ["ev_3"], tags: ["Exposed brick"], role: "base" },
      { label: "Fern shadow", hex: "#3F5A45", evidence: ["ev_3"], tags: ["Plants"], role: "base" },
      { label: "Film-stock cream", hex: "#EADFC8", evidence: ["ev_3"], tags: ["Intimate"], role: "base" },
      { label: "Midnight ink", hex: "#1E2230", evidence: ["ev_3"], tags: ["Dim lighting"], role: "base" },
    ],
    lighting: [
      { label: "Low, warm pendants", detail: "No overhead fluorescents", evidence: ["ev_3"] },
      { label: "Candle-level tables", evidence: ["ev_3"] },
    ],
    materials: [
      { label: "Warm wood", evidence: ["ev_3"] },
      { label: "Exposed brick", evidence: ["ev_3"] },
      { label: "Living plants", evidence: ["ev_3"] },
    ],
    referencePlaces: [
      { label: "Sunday Lantern Cafe", detail: "Brooklyn", evidence: ["ev_2"], qlooId: "ent_p1" },
      { label: "Pho Hollow", detail: "Brooklyn", evidence: ["ev_2"], qlooId: "ent_p2" },
      { label: "The Quiet Reel", detail: "Brooklyn", evidence: ["ev_2"], qlooId: "ent_p3" },
    ],
  },
  sound: {
    direction: "Hushed, textured and a little melancholy: guitars with space around them, electronics that breathe.",
    artists: [
      { label: "Mitski", evidence: ["ev_1"], qlooId: "ent_a1" },
      { label: "Bon Iver", evidence: ["ev_1"], qlooId: "ent_a2" },
      { label: "Big Thief", evidence: ["ev_1"], qlooId: "ent_a3" },
      { label: "Jon Hopkins", evidence: ["ev_1"], qlooId: "ent_a4" },
    ],
  },
  pairings: [
    { label: "Lemongrass broth with a slow-cooked short rib", detail: "Menu idea", evidence: ["ev_2"] },
    { label: "Criterion-style film night kit", detail: "Collab with a film label", evidence: ["ev_4"] },
    { label: "Small-batch botanical candle", detail: "Merch", evidence: ["ev_4"] },
  ],
  whereTheyAre: {
    city: "Brooklyn",
    hotspots: [
      { label: "Williamsburg", evidence: ["ev_5"] },
      { label: "Greenpoint", evidence: ["ev_5"] },
      { label: "Bed-Stuy", evidence: ["ev_5"] },
    ],
  },
  messaging: {
    tone: "Quiet confidence. Speak like a friend who has seen the film twice and will not spoil it.",
    phrases: ["Stay a little longer.", "Made slowly, on purpose.", "Dim the lights."],
    evidence: ["ev_1", "ev_3"],
  },
};

export const sampleDropped: readonly DroppedItem[] = [
  { section: "pairings", label: "Neon cocktail flight", reason: "no_evidence", evidence: [] },
  { section: "sound", label: "Stadium EDM nights", reason: "unknown_evidence", evidence: ["ev_99"] },
];

export const sampleProof: TasteProof = {
  baseline: [
    { name: "Coldplay", kind: "artist", affinity: 0.34 },
    { name: "Ed Sheeran", kind: "artist", affinity: 0.22 },
    { name: "Starbucks Reserve", kind: "place", affinity: 0.4 },
    { name: "Harbor & Vine Bistro", kind: "place", affinity: null },
    { name: "Nike", kind: "brand", affinity: 0.29 },
  ],
  tasteforge: [
    { name: "Mitski", kind: "artist", affinity: 0.91, evidence: ["ev_1"] },
    { name: "Bon Iver", kind: "artist", affinity: 0.88 },
    { name: "Sunday Lantern Cafe", kind: "place", affinity: 0.93, address: "14 Court St Brooklyn", local: true },
    { name: "Pho Hollow", kind: "place", affinity: 0.89, address: "212 Smith St Brooklyn", local: true },
    { name: "Criterion Collection", kind: "brand", affinity: 0.87 },
  ],
  baselineAvg: 0.31,
  tasteforgeAvg: 0.9,
  baselineNotFound: 1,
  city: "Brooklyn",
};
