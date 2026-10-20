import { unfence } from "@/lib/agent/fence";
import type { LlmProvider } from "./types";

/**
 * Deterministic offline provider for LLM_PROVIDER=mock (E2E tests, demos without keys). It answers
 * each pipeline stage with JSON derived from the request text and the evidence it is shown, so the
 * "LLM translates, Qloo decides" rule still holds: every item cites ids that appear in the prompt.
 */

type Rec = {
  readonly evidence_id: string;
  readonly summary?: string;
  readonly entities?: readonly { id: string; name: string }[];
  readonly tags?: readonly { id: string; name: string }[];
};
type Item = { label: string; detail?: string; evidence: string[]; qlooId?: string };

const KNOWN_SEEDS: readonly { name: string; kind: string }[] = [
  { name: "Radiohead", kind: "artist" },
  { name: "A24", kind: "brand" },
];
const SWATCH_HEX = ["#8A6F4D", "#3F5A4B", "#E3D3B0", "#6B4F4F", "#C4492B", "#B8785A"] as const;
const SWATCH_NAMES = ["Walnut brown", "Moss green", "Brass gold", "Oxblood", "Ink navy", "Clay terracotta"] as const;
const MAX_ITEMS = 6;

const grab = (prompt: string, label: string): string => unfence(new RegExp(`^${label}: (.*)$`, "m").exec(prompt)?.[1]?.trim() ?? "");

function seedPlan(prompt: string): unknown {
  const request = grab(prompt, "Request");
  const city = grab(prompt, "City");
  const seeds = KNOWN_SEEDS.filter((s) => request.toLowerCase().includes(s.name.toLowerCase()));
  const tags = ["indie music", "slow living"];
  return { seeds, tags, ...(city && city !== "none given" ? { city } : {}), audienceHints: "Culturally curious people who value calm, craft and good music." };
}

function parseRecords(prompt: string): Rec[] {
  const start = prompt.indexOf("[", prompt.indexOf("Evidence records"));
  try {
    return JSON.parse(prompt.slice(start)) as Rec[];
  } catch {
    return [];
  }
}

const kindOf = (id: string): string => /^MOCK-(?:MAIN-)?([A-Z]+)/.exec(id)?.[1]?.toLowerCase() ?? "";

function entityItems(records: readonly Rec[], kinds: readonly string[], detail: string): Item[] {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const r of records) {
    for (const e of r.entities ?? []) {
      if (!kinds.includes(kindOf(e.id)) || seen.has(e.id)) continue;
      seen.add(e.id);
      out.push({ label: e.name.slice(0, 120), detail, evidence: [r.evidence_id], qlooId: e.id });
    }
  }
  return out.slice(0, MAX_ITEMS);
}

function tagItems(records: readonly Rec[], needle: string, detail: string): Item[] {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const r of records) {
    for (const t of r.tags ?? []) {
      if (!t.id.includes(needle) || seen.has(t.id)) continue;
      seen.add(t.id);
      out.push({ label: t.name, detail, evidence: [r.evidence_id], qlooId: t.id });
    }
  }
  return out.slice(0, MAX_ITEMS);
}

/** Five named colours, each tied to one of the Qloo tags (cycling when there are fewer tags); none without tags. */
function palette(tags: readonly Item[]): unknown[] {
  if (tags.length === 0) return [];
  return SWATCH_NAMES.slice(0, 5).map((label, i) => {
    const t = tags[i % tags.length];
    return { label, detail: t.detail, evidence: t.evidence, qlooId: t.qlooId, hex: SWATCH_HEX[i % SWATCH_HEX.length], tags: [t.label], role: i === 4 ? "accent" : "base" };
  });
}

function hotspotItems(heat: Rec, city: string): Item[] {
  const spots = (heat.entities ?? []).slice(0, 5).map((e, i) => ({
    label: e.name.slice(0, 120),
    detail: i === 0 ? "Strongest concentration of this audience." : "Strong concentration of this audience.",
    evidence: [heat.evidence_id],
    qlooId: e.id,
  }));
  return spots.length > 0 ? spots : [{ label: `Where they gather in ${city}`, detail: heat.summary?.slice(0, 380), evidence: [heat.evidence_id] }];
}

function brief(prompt: string): unknown {
  const records = parseRecords(prompt);
  const city = grab(prompt, "City");
  const decor = tagItems(records, "decor", "Decor tag the audience's favourite places share.");
  const ambience = tagItems(records, "ambience", "Ambience tag the audience's favourite places share.");
  const heat = records.find((r) => /heatmap/i.test(r.summary ?? ""));
  const demo = records.filter((r) => /^Audience skews/.test(r.summary ?? ""));
  const all = records.map((r) => r.evidence_id);
  const cityName = city && !city.startsWith("none") ? city : "";
  return {
    title: `A brief for ${cityName || "your"} audience`,
    audienceProfile: {
      summary: "Thoughtful, culture-hungry people who prefer unhurried rooms, independent music and well-made things.",
      affinities: entityItems(records, ["movie", "tv", "main"], "Taste signal from the audience graph."),
      demographics: demo.map((r) => ({ label: "Age and gender skew", detail: r.summary?.slice(0, 380), evidence: [r.evidence_id] })),
    },
    aesthetic: {
      palette: palette([...decor, ...ambience]),
      lighting: ambience.slice(0, 3),
      materials: decor.slice(0, 3),
      referencePlaces: entityItems(records, ["place"], "Place this audience already loves."),
    },
    sound: {
      direction: "Warm, understated records at low volume; dream pop and indie folk at the centre.",
      artists: entityItems(records, ["artist"], "Artist the audience over-indexes on."),
    },
    pairings: entityItems(records, ["brand"], "Brand the audience over-indexes on."),
    ...(heat && cityName ? { whereTheyAre: { city: cityName, hotspots: hotspotItems(heat, cityName) } } : {}),
    messaging: {
      tone: "Quiet confidence, specific and warm; never loud.",
      phrases: ["Take the long way round", "Made slowly, shared gladly", "Stay a while"],
      evidence: all.slice(0, 3),
    },
  };
}

/** Plain-LLM picks for the Taste Proof baseline: popular names with little audience fit. */
const BASELINE = {
  artists: ["Coldplay", "Ed Sheeran", "Taylor Swift", "Imagine Dragons"],
  places: ["Starbucks", "Costa Coffee", "Cafe Coffee Day"],
  brands: ["Nike", "Apple", "Coca-Cola"],
};

/** What a plain model suggests for an Indian city: partly known names, partly not in the taste graph. */
const BASELINE_INDIA = {
  artists: ["Arijit Singh", "A.R. Rahman", "Prateek Kuhad", "Badshah", "Diljit Dosanjh"],
  places: ["Chaayos", "Cafe Coffee Day", "Starbucks Indore", "Indian Coffee House", "Cafe Mocha"],
  brands: ["Fabindia", "Tata", "Amul", "Nike"],
};

const INDIAN_CITY = /indore|mumbai|delhi|bengaluru|bangalore|pune|jaipur|bhopal|hyderabad|chennai|kolkata/i;

export function createScriptedLlm(): LlmProvider {
  return {
    name: "mock",
    async chatJson(req) {
      if (req.system.startsWith("You extract")) return seedPlan(req.prompt);
      if (req.system.startsWith("You are the critic")) return { followUps: [] };
      if (req.system.startsWith("You are TasteForge")) return brief(req.prompt);
      return INDIAN_CITY.test(grab(req.prompt, "City")) ? BASELINE_INDIA : BASELINE;
    },
  };
}
