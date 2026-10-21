import type { Swatch } from "../brief";
import { ACCENT_MIN_DISTANCE, ACCENT_MIN_SATURATION, MIN_SWATCH_DISTANCE, type DerivedSwatch } from "./derive";
import { paletteProblem } from "../palette";
import { distance, hexToHsl } from "./math";
import { colourName } from "./names";

/** The model may shift a derived colour by this much (RGB distance) and no more: it names the swatch, code chose it. */
export const NUDGE_MAX_DISTANCE = 36;
const MAX_LABEL_CHARS = 60;

const norm = (s: string): string => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The swatches as the synthesis prompt shows them to the model (compact, in the order the reply must keep). */
export function paletteLines(derived: readonly DerivedSwatch[]): string {
  return derived.map((s, i) => `${i + 1}. ${s.hex} ${s.role}; tags: ${s.tags.join(", ")}`).join("\n");
}

type NameEntry = { readonly label?: unknown; readonly hex?: unknown };

const entriesOf = (reply: unknown): NameEntry[] => (Array.isArray(reply) ? reply.map((e) => (e && typeof e === "object" ? (e as NameEntry) : {})) : []);

function cleanLabel(raw: unknown, tags: readonly string[], used: ReadonlySet<string>): string | undefined {
  if (typeof raw !== "string") return undefined;
  const label = raw.trim();
  const key = norm(label);
  if (label.length === 0 || label.length > MAX_LABEL_CHARS || used.has(key)) return undefined;
  // A swatch is named like a colour; a tag name echoed back ("Cozy") is not a colour name.
  return tags.some((t) => norm(t) === key) ? undefined : label;
}

/** The model's nudged hex when it stays inside the family (close to the derived one) and keeps the contrast rules. */
function nudged(raw: unknown, derived: DerivedSwatch, others: readonly string[]): string {
  if (typeof raw !== "string" || !/^#[0-9a-fA-F]{6}$/.test(raw)) return derived.hex;
  const hex = raw.toUpperCase();
  if (distance(hex, derived.hex) > NUDGE_MAX_DISTANCE) return derived.hex;
  if (!others.every((o) => distance(hex, o) >= MIN_SWATCH_DISTANCE)) return derived.hex;
  // A nudged accent may not get closer to a colour than the lesser of the required gap and where it started.
  const holdsGap = (o: string): boolean => distance(hex, o) >= Math.min(ACCENT_MIN_DISTANCE, distance(derived.hex, o));
  if (derived.role === "accent" && (hexToHsl(hex).s < ACCENT_MIN_SATURATION || !others.every(holdsGap))) return derived.hex;
  return hex;
}

/**
 * The final palette: colours, roles, tags and evidence all come from code; the model's reply (one `{label, hex?}` per
 * swatch, in order) only supplies names and small hex nudges. A missing or unusable name falls back to the nearest entry
 * of the colour-name table, so every swatch ends up with a real colour name.
 */
export function finishPalette(derived: readonly DerivedSwatch[], modelReply: unknown): Swatch[] {
  const finished = nameSwatches(derived, modelReply);
  // A last check with the quality rules the palette must meet; if the model's names or nudges broke one, code's own result stands.
  return paletteProblem(finished) && modelReply !== undefined ? nameSwatches(derived, undefined) : finished;
}

function nameSwatches(derived: readonly DerivedSwatch[], modelReply: unknown): Swatch[] {
  const names = entriesOf(modelReply);
  const used = new Set<string>();
  const hexes = derived.map((d) => d.hex);
  return derived.map((d, i) => {
    const others = hexes.filter((_, j) => j !== i);
    const hex = nudged(names[i]?.hex, d, others);
    hexes[i] = hex;
    const label = cleanLabel(names[i]?.label, d.tags, used) ?? colourName(hex, used);
    used.add(norm(label));
    return { label, hex, evidence: [...d.evidence], tags: [...d.tags], role: d.role };
  });
}
