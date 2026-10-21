import type { Ledger } from "../ledger";

/** Test fixtures for the synthesis prompt: a ledger with long (UUID-sized) Qloo ids and a model reply that uses their aliases. */

export const longId = (n: number): string => `3d8f1a4a-0000-4000-8000-${String(n).padStart(12, "0")}`;

export function richLedger(decor: readonly string[] = ["Vintage", "Retro", "Cozy"]): Ledger {
  return {
    records: [
      {
        id: "ev_1",
        endpoint: "/v2/insights",
        params: { type: "artist" },
        summary: "3 results",
        entities: [
          { id: longId(1), name: "Artist One", affinity: 0.9 },
          { id: longId(2), name: "Artist Two", affinity: 0.8 },
        ],
      },
      {
        id: "ev_2",
        endpoint: "/v2/insights",
        params: { type: "place" },
        summary: "2 results",
        entities: [{ id: longId(3), name: "Cafe A", note: "12 Main St | $$", lat: 22.7, lon: 75.8 }],
      },
      {
        id: "ev_3",
        endpoint: "/v2/insights (urn:tag)",
        params: {},
        summary: "tags",
        tags: decor.map((name, i) => ({ id: `urn:tag:decor:qloo:${name.toLowerCase()}`, name, score: 0.9 - i * 0.1 })),
      },
    ],
  };
}

/** What the model sends back: swatch names by position, an artist cited by its alias, everything else minimal. */
export function goodDraftReply(): unknown {
  return {
    title: "A brief",
    audienceProfile: { summary: "People who like calm rooms.", affinities: [] },
    aesthetic: {
      palette: [{ label: "Ivory whisper" }, { label: "Warm amber" }, { label: "Deep charcoal" }, { label: "Orchid accent" }, { label: "Soft slate" }],
      lighting: [],
      materials: [],
      referencePlaces: [],
    },
    sound: { direction: "Soft records.", artists: [{ label: "Artist One", evidence: ["ev_1"], qlooId: "q1" }] },
    pairings: [],
    messaging: { tone: "Warm", phrases: ["Stay a while"], evidence: ["ev_1"] },
  };
}
