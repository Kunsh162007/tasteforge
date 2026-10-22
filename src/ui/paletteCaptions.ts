import { isNameLike, nameKey } from "@/lib/agent/colour/cues";
import { fixPossessive } from "@/lib/qloo/displayName";
import type { Evidence, Swatch } from "./contract";

/** Most tags shown under one swatch. */
export const CAPTION_TAGS = 2;

const STYLE_PREFIXES = ["urn:tag:decor:", "urn:tag:ambience:"];
/** Dish tags name a venue's signature plate ("Buddy S Burger"): fine as a colour cue, misleading as a style caption. */
const DISH_PREFIXES = ["urn:tag:specialty_dish:"];
const norm = (s: string): string => s.trim().toLowerCase();

/** Names of the dish tags in the records a swatch cites. */
function dishNames(swatch: Pick<Swatch, "evidence">, evidence: Readonly<Record<string, Evidence>>): Set<string> {
  const out = new Set<string>();
  for (const id of swatch.evidence) {
    for (const t of evidence[id]?.tags ?? []) if (DISH_PREFIXES.some((p) => t.id.startsWith(p))) out.add(nameKey(t.name));
  }
  return out;
}

/** Names of the decor and ambience tags in the records a swatch cites (the tags that drive colour most directly). */
function styleNames(swatch: Pick<Swatch, "evidence">, evidence: Readonly<Record<string, Evidence>>): Set<string> {
  const out = new Set<string>();
  for (const id of swatch.evidence) {
    for (const t of evidence[id]?.tags ?? []) if (STYLE_PREFIXES.some((p) => t.id.startsWith(p))) out.add(norm(t.name));
  }
  return out;
}

/**
 * Only Qloo tags may caption a swatch: a name that is a place, brand or artist in the evidence (or a possessive venue name)
 * is dropped. When the swatch cites records with tags, a caption must also be one of those tags.
 */
function tagCaptionsOnly(swatch: Pick<Swatch, "tags" | "evidence">, evidence: Readonly<Record<string, Evidence>>): string[] {
  const entityNames = new Set(Object.values(evidence).flatMap((r) => (r.entities ?? []).map((e) => nameKey(e.name))));
  const cited = new Set(swatch.evidence.flatMap((id) => (evidence[id]?.tags ?? []).map((t) => nameKey(t.name))));
  const dishes = dishNames(swatch, evidence);
  return (swatch.tags ?? [])
    .filter((t) => (cited.size === 0 || cited.has(nameKey(t))) && !isNameLike(t, entityNames) && !dishes.has(nameKey(t)))
    .map(fixPossessive);
}

/** Style tag names (original casing) from the records a swatch cites: the fallback when no swatch tag qualifies. */
function citedStyleTags(swatch: Pick<Swatch, "evidence">, evidence: Readonly<Record<string, Evidence>>): string[] {
  return swatch.evidence.flatMap((id) => (evidence[id]?.tags ?? []).filter((t) => STYLE_PREFIXES.some((p) => t.id.startsWith(p))).map((t) => fixPossessive(t.name)));
}

/**
 * Display only: the tags to show under each swatch. Decor, ambience and style tags come first (the swatch's own order
 * breaks ties), at most two per swatch, and a tag already shown under an earlier swatch gives way to one not yet used, so
 * two swatches never read the same. When every candidate is taken, a swatch keeps its first tag that makes its caption unique.
 */
export function swatchCaptions(palette: readonly Pick<Swatch, "tags" | "evidence">[], evidence: Readonly<Record<string, Evidence>>): string[][] {
  const used = new Set<string>();
  const shown = new Set<string>();
  return palette.map((s) => {
    const style = styleNames(s, evidence);
    const own = tagCaptionsOnly(s, evidence);
    const tags = own.length > 0 ? own : citedStyleTags(s, evidence);
    const ordered = [...tags.filter((t) => style.has(norm(t))), ...tags.filter((t) => !style.has(norm(t)))];
    const fresh = ordered.filter((t) => !used.has(norm(t)));
    const picked = fresh.slice(0, CAPTION_TAGS);
    const options = picked.length > 0 ? picked : ordered.slice(0, CAPTION_TAGS);
    const caption = options.length > 1 && shown.has(options.map(norm).join("|")) ? options.slice(0, 1) : options;
    for (const t of caption) used.add(norm(t));
    shown.add(caption.map(norm).join("|"));
    return caption;
  });
}
