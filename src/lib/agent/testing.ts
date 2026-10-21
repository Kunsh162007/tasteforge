import type { JsonRequest, LlmProvider } from "@/lib/llm";
import type { BriefDraft, Item } from "./brief";
import type { Evidence } from "./ledger";

/** Test helpers shared by agent tests (excluded from coverage). */

export const item = (label: string, evidence: string[]): Item => ({ label, evidence });

/** A palette that passes the quality check: named colours, neutrals and one clear accent. */
export const goodPalette = (evidence: string[], tags: string[] = ["Exposed brick"]) =>
  [
    { label: "Brick ember", hex: "#8B4A3B" },
    { label: "Bone linen", hex: "#E3D3B0" },
    { label: "Fern shadow", hex: "#3F5A4B" },
    { label: "Lantern orange", hex: "#E0702B" },
  ].map((c) => ({ ...c, evidence, tags }));

/** What the model sends for the palette now: names only, in the order of the swatches the prompt lists. */
export const NAMED_SWATCHES = [{ label: "Brick ember" }, { label: "Bone linen" }, { label: "Fern shadow" }, { label: "Lantern orange" }];

export function makeDraft(evidence: string[], overrides: Partial<BriefDraft> = {}): BriefDraft {
  return {
    title: "Brooklyn dream-pop crowd",
    audienceProfile: {
      summary: "Indie, nocturnal, design-literate.",
      affinities: [item("Velvet Static (band)", evidence)],
      demographics: [item("25-34 skew", evidence)],
    },
    aesthetic: {
      palette: [{ ...item("Exposed brick", evidence), hex: "#8B4A3B" }],
      lighting: [item("Warm low light", evidence)],
      materials: [item("Reclaimed brick", evidence)],
      referencePlaces: [item("Cafe Lumen", evidence)],
    },
    sound: { direction: "Hazy guitars", artists: [item("Paper Lanterns (band)", evidence)] },
    pairings: [item("Fernwick Goods (brand)", evidence)],
    whereTheyAre: { city: "Brooklyn", hotspots: [item("Hotspot A", evidence)] },
    messaging: { tone: "Soft, nocturnal", phrases: ["after hours"], evidence },
    ...overrides,
  };
}

// ---- Pipeline test helpers -------------------------------------------------


type Route = ((req: JsonRequest) => unknown) | Readonly<Record<string, unknown>> | Error;
export type Routes = {
  seeds?: Route;
  critic?: Route;
  synthesis?: Route;
  baseline?: Route;
  repair?: Route;
};

export type RoutedLlm = LlmProvider & {
  /** Names of the JSON routes hit, in call order. */
  readonly calls: string[];
};

const MARKERS: readonly [keyof Routes, string][] = [
  ["seeds", "extract taste-graph seeds"],
  ["critic", "critic of a taste-graph"],
  ["synthesis", "cultural briefing writer"],
  ["baseline", "no access to any data source"],
  ["repair", "repair one section"],
];

/** LLM stub that answers each pipeline JSON call from its own route, whatever the call order. */
export function routedLlm(routes: Routes, name = "routed"): RoutedLlm {
  const calls: string[] = [];
  return {
    name,
    calls,
    async chatJson(req: JsonRequest): Promise<unknown> {
      const hit = MARKERS.find(([, marker]) => req.system.includes(marker));
      if (!hit) throw new Error("routedLlm: unknown JSON call");
      const route = routes[hit[0]];
      if (route === undefined) throw new Error(`routedLlm: no route for ${hit[0]}`);
      calls.push(hit[0]);
      if (route instanceof Error) throw route;
      return typeof route === "function" ? (route as (r: JsonRequest) => unknown)(req) : route;
    },
  };
}

function recordsFromPrompt(prompt: string): { evidence_id: string; entities?: { id: string; name: string }[]; decor?: string[]; ambience?: string[]; tags?: string[] }[] {
  const line = prompt.split("\n").find((l) => l.startsWith("[{"));
  return line ? JSON.parse(line) : [];
}

/** Builds a valid brief draft that cites real evidence ids found in a synthesis prompt. */
export function draftFromPrompt(prompt: string): unknown {
  const records = recordsFromPrompt(prompt);
  const refs = (prefix: string) =>
    records.flatMap((r) => (r.entities ?? []).filter((e) => e.id.startsWith(prefix)).map((e) => ({ ...e, ev: r.evidence_id })));
  const asItem = (e: { id: string; name: string; ev: string }) => ({ label: e.name, evidence: [e.ev], qlooId: e.id });
  const first = records[0]?.evidence_id ?? "ev_1";
  const decor = records.flatMap((r) => (r.decor ?? []).map((name) => ({ name, ev: r.evidence_id })));
  return {
    title: "Mock brief",
    audienceProfile: {
      summary: "Indie, nocturnal, design-literate.",
      affinities: refs("MOCK-MOVIE").slice(0, 2).map(asItem),
      demographics: [{ label: "25-34 skew", evidence: [first] }],
    },
    aesthetic: {
      palette: decor.length > 0 ? NAMED_SWATCHES : [],
      lighting: [{ label: "Warm low light", evidence: [first] }],
      materials: [],
      referencePlaces: refs("MOCK-PLACE").slice(0, 4).map(asItem),
    },
    sound: { direction: "Hazy guitars", artists: refs("MOCK-ARTIST").slice(0, 5).map(asItem) },
    pairings: refs("MOCK-BRAND").slice(0, 3).map(asItem),
    messaging: { tone: "Soft, nocturnal", phrases: ["after hours"], evidence: [first] },
  };
}

export const evidenceOf = (id: string, over: Partial<Evidence> = {}): Evidence => ({
  id,
  endpoint: "/v2/insights",
  params: { type: "artist" },
  summary: "1 results; top: x",
  ...over,
});
