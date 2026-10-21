import type { QlooClient, QlooEntity, QlooTag } from "@/lib/qloo";
import type { EvidenceTag } from "../ledger";

/**
 * Per-place tags and signature dishes, remembered from the place results Qloo already returned. They let the
 * brief rank style tags by how specific they are to the top places (instead of Qloo's pooled order, which
 * favours words every venue has) and name real dishes for the pairings, at no extra API cost.
 */

export type Dish = { readonly id: string; readonly name: string; readonly weight: number };
export type PlaceFacts = { readonly tags: readonly QlooTag[]; readonly dishes: readonly Dish[]; /** Street address, which names the neighbourhood a hotspot lies in. */ readonly address?: string };

const STYLE_FAMILIES = ["urn:tag:decor:", "urn:tag:ambience:"];
const CUISINE_PREFIX = "urn:tag:cuisine:";
/** A style tag found on more than this share of the city's ordinary places says nothing about these ones. */
const GENERIC_SHARE = 0.5;
const MIN_PLACES_WITH_TAG = 2;
const CUISINE_WEIGHT = 0.6;
const MIN_DISH_WEIGHT = 0.5;
const MAX_STYLE_TAGS = 15;
const MAX_MENU_TAGS = 10;
/** Words Qloo returns as "dishes" that are not menu items. */
const NOT_A_DISH = new Set(["white", "black", "red", "green", "special", "signature", "original", "classic", "new", "other", "extra"]);

const round2 = (n: number): number => Math.round(n * 100) / 100;
const isPlace = (e: QlooEntity): boolean => e.type.includes(":place");
const isStyle = (t: QlooTag): boolean => STYLE_FAMILIES.some((p) => t.id.startsWith(p));
const key = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Qloo's dish names sometimes keep a stray article from the menu text ("And Fries", "Les Pizzas"). */
const tidyDish = (name: string): string => name.replace(/^(and|les|the|with)\s+/i, "").trim();

function dishesOf(e: QlooEntity): Dish[] {
  const raw = (e.properties as { specialty_dishes?: unknown } | undefined)?.specialty_dishes;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((d): Dish[] => {
    const o = d as { id?: unknown; name?: unknown; weight?: unknown };
    if (typeof o.name !== "string" || typeof o.id !== "string") return [];
    return [{ id: o.id, name: o.name, weight: typeof o.weight === "number" ? o.weight : 0.5 }];
  });
}

function addressOf(e: QlooEntity): { address?: string } {
  const raw = (e.properties as { address?: unknown } | undefined)?.address;
  return typeof raw === "string" && raw.trim() !== "" ? { address: raw.trim() } : {};
}

export function rememberPlaces(facts: Map<string, PlaceFacts>, entities: readonly QlooEntity[]): void {
  for (const e of entities) {
    if (isPlace(e)) facts.set(e.id, { tags: e.tags ?? [], dishes: dishesOf(e), ...addressOf(e) });
  }
}

/** A client that notes the tags and dishes of every place its insights calls return. */
export function withPlaceFacts(qloo: QlooClient, facts: Map<string, PlaceFacts>): QlooClient {
  return {
    ...qloo,
    async insights(p) {
      const r = await qloo.insights(p);
      rememberPlaces(facts, r.data);
      return r;
    },
  };
}

/** Share of the given places that carry each style tag. */
export function baselineShares(places: readonly QlooEntity[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of places) for (const id of new Set((p.tags ?? []).filter(isStyle).map((t) => t.id))) counts.set(id, (counts.get(id) ?? 0) + 1);
  return new Map([...counts].map(([id, n]) => [id, n / Math.max(places.length, 1)]));
}

/**
 * Decor and ambience tags that several of the top places share and the city's ordinary places do not, most
 * specific first. Score = share among top places minus share in the baseline.
 */
export function rankStyleTags(topIds: readonly string[], facts: ReadonlyMap<string, PlaceFacts>, baseline: ReadonlyMap<string, number>): EvidenceTag[] {
  const known = topIds.flatMap((id) => facts.get(id) ?? []);
  if (known.length === 0) return [];
  const found = new Map<string, { tag: QlooTag; count: number }>();
  for (const f of known) {
    for (const t of new Map(f.tags.filter(isStyle).map((x) => [x.id, x])).values()) {
      found.set(t.id, { tag: t, count: (found.get(t.id)?.count ?? 0) + 1 });
    }
  }
  const minCount = Math.min(MIN_PLACES_WITH_TAG, known.length);
  const seenNames = new Set<string>();
  return [...found.values()]
    .map((c) => ({ ...c, lift: c.count / known.length - (baseline.get(c.tag.id) ?? 0), generic: (baseline.get(c.tag.id) ?? 0) > GENERIC_SHARE }))
    .filter((c) => c.count >= minCount && !c.generic && c.lift > 0)
    .sort((a, b) => b.lift - a.lift || b.count - a.count)
    .filter((c) => (seenNames.has(key(c.tag.name)) ? false : (seenNames.add(key(c.tag.name)), true)))
    .slice(0, MAX_STYLE_TAGS)
    .map((c) => ({ id: c.tag.id, name: c.tag.name, score: round2(c.lift) }));
}

/** Signature dishes (by combined weight across the places) followed by cuisines, as tags for the pairings. */
export function menuTags(topIds: readonly string[], facts: ReadonlyMap<string, PlaceFacts>): EvidenceTag[] {
  const dishes = new Map<string, { id: string; name: string; weight: number; best: number }>();
  const cuisines = new Map<string, { id: string; name: string }>();
  for (const f of topIds.flatMap((id) => facts.get(id) ?? [])) {
    for (const d of f.dishes) {
      const name = tidyDish(d.name);
      const k = key(name);
      if (d.weight < MIN_DISH_WEIGHT || k === "" || NOT_A_DISH.has(k)) continue;
      const prev = dishes.get(k);
      dishes.set(k, { id: prev?.id ?? d.id, name: prev && prev.best >= d.weight ? prev.name : name, weight: (prev?.weight ?? 0) + d.weight, best: Math.max(prev?.best ?? 0, d.weight) });
    }
    for (const t of f.tags) if (t.id.startsWith(CUISINE_PREFIX)) cuisines.set(key(t.name), { id: t.id, name: t.name });
  }
  const ranked: EvidenceTag[] = [...dishes.values()].sort((a, b) => b.weight - a.weight).map((d) => ({ id: d.id, name: d.name, score: round2(d.weight) }));
  const cuisine: EvidenceTag[] = [...cuisines.values()].filter((c) => !dishes.has(key(c.name))).map((c) => ({ id: c.id, name: c.name, score: CUISINE_WEIGHT }));
  return [...ranked, ...cuisine].slice(0, MAX_MENU_TAGS);
}
