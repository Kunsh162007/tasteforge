import type { Evidence, Swatch } from "./contract";

/** Most tags shown under one swatch. */
export const CAPTION_TAGS = 2;

const STYLE_PREFIXES = ["urn:tag:decor:", "urn:tag:ambience:"];
const norm = (s: string): string => s.trim().toLowerCase();

/** Names of the decor and ambience tags in the records a swatch cites (the tags that drive colour most directly). */
function styleNames(swatch: Pick<Swatch, "evidence">, evidence: Readonly<Record<string, Evidence>>): Set<string> {
  const out = new Set<string>();
  for (const id of swatch.evidence) {
    for (const t of evidence[id]?.tags ?? []) if (STYLE_PREFIXES.some((p) => t.id.startsWith(p))) out.add(norm(t.name));
  }
  return out;
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
    const tags = s.tags ?? [];
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
