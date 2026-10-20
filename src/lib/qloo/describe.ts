/**
 * Short, human-readable facts pulled from an entity's `properties` (shapes verified live 2026-10-20).
 * The brief writer sees only these notes, so each one stays under NOTE_MAX_CHARS.
 */

type Obj = Readonly<Record<string, unknown>>;

/** Small on purpose: ~100 evidence entities go to the model in one prompt, and the Groq fallback has an 8k-token minute budget. */
const NOTE_MAX_CHARS = 120;
const ADDRESS_MAX_CHARS = 60;
const PRICE_SIGNS = ["$", "$$", "$$$", "$$$$"];

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
const strList = (v: unknown, n: number): string[] =>
  (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && x !== "").slice(0, n);

function clipAt(text: string | undefined, max: number): string | undefined {
  return text === undefined || text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function clip(text: string): string {
  return text.length <= NOTE_MAX_CHARS ? text : `${text.slice(0, NOTE_MAX_CHARS - 1).trimEnd()}…`;
}

/** First sentence-ish chunk of a description. */
function lead(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const first = text.split(/(?<=[.!?])\s/)[0];
  return first;
}

function priceSign(level: unknown): string | undefined {
  return typeof level === "number" && level >= 1 && level <= 4 ? PRICE_SIGNS[Math.round(level) - 1] : undefined;
}

type Parts = (string | undefined)[];

function placeNote(p: Obj): Parts {
  const rating = typeof p.business_rating === "number" ? `${p.business_rating.toFixed(1)}/5` : undefined;
  return [
    clipAt(str(p.address), ADDRESS_MAX_CHARS),
    [priceSign(p.price_level), rating].filter(Boolean).join(" "),
    lead(str(p.short_description) ?? str(p.description)),
    strList(p.specialty_dishes, 3).join(", "),
  ];
}

function brandNote(p: Obj): Parts {
  const lo = p.price_range_usd_min;
  const hi = p.price_range_usd_max;
  const price = typeof lo === "number" && typeof hi === "number" ? `USD ${lo}-${hi}` : undefined;
  return [
    lead(str(p.short_description) ?? str(p.tagline)),
    strList(p.personal_style, 3).join(", "),
    strList(p.aesthetic_properties, 2).join(", "),
    price,
  ];
}

function artistNote(p: Obj): Parts {
  return [
    lead(str(p.short_description) ?? str(p.description)),
    strList(p.primary_genres, 2).join(", "),
    strList(p.adjectives_for_music, 3).join(", "),
  ];
}

function screenNote(p: Obj): Parts {
  const year = typeof p.release_year === "number" ? String(p.release_year) : undefined;
  return [[strList(p.genres, 3).join("/"), year].filter(Boolean).join(" "), lead(str(p.style_description) ?? str(p.description))];
}

const BY_KIND: Readonly<Record<string, (p: Obj) => Parts>> = {
  place: placeNote,
  brand: brandNote,
  artist: artistNote,
  movie: screenNote,
  tv_show: screenNote,
};

/** One-line note for an entity of the given Qloo subtype, or undefined when nothing useful is known. */
export function entityNote(subtype: string, properties: unknown): string | undefined {
  if (!isObj(properties)) return undefined;
  const kind = subtype.split(":").pop() ?? "";
  const parts = (BY_KIND[kind] ?? ((p: Obj): Parts => [lead(str(p.short_description) ?? str(p.description))]))(properties);
  const note = parts.filter((x): x is string => typeof x === "string" && x !== "").join(" | ");
  return note === "" ? undefined : clip(note);
}

/** Entity image URL (`properties.image.url`, or the first of `properties.images`). */
export function entityImage(properties: unknown): string | undefined {
  if (!isObj(properties)) return undefined;
  if (isObj(properties.image)) return str(properties.image.url);
  const first = Array.isArray(properties.images) ? properties.images[0] : undefined;
  return isObj(first) ? str(first.url) : undefined;
}
