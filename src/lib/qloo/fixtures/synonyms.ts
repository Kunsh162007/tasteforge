/**
 * Mock tag search helpers: lets free-text queries ("cosy brick cafes", "slow living", "japanese
 * ceramics") hit the small synthetic tag universe the way Qloo's semantic tag search would.
 */

/** Common words mapped to words found in mock tag names / slugs. */
export const TAG_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  cosy: ["cozy", "intimate"],
  cozy: ["intimate", "quiet"],
  comfy: ["cozy"],
  calm: ["quiet", "slow living"],
  relaxed: ["quiet", "cozy"],
  mindful: ["slow living", "quiet"],
  slow: ["slow living", "quiet"],
  indie: ["indie", "dream pop", "folk", "shoegaze"],
  alternative: ["indie"],
  music: ["indie", "dream pop"],
  minimal: ["minimalist"],
  modern: ["minimalist", "industrial"],
  scandinavian: ["minimalist"],
  vintage: ["vintage", "retro"],
  retro: ["vintage"],
  antique: ["vintage"],
  coffee: ["coffee"],
  cafe: ["coffee"],
  espresso: ["coffee"],
  tea: ["japanese", "coffee"],
  jazz: ["jazz", "lo-fi"],
  japanese: ["japanese", "minimalist", "wabi"],
  japan: ["japanese"],
  ceramic: ["ceramic", "rustic", "wabi"],
  pottery: ["ceramic", "rustic"],
  handmade: ["ceramic", "rustic"],
  craft: ["ceramic", "rustic"],
  artisan: ["ceramic", "rustic"],
  plant: ["botanical"],
  green: ["botanical"],
  garden: ["botanical"],
  vietnamese: ["vietnamese"],
  pho: ["vietnamese"],
  film: ["arthouse"],
  cinema: ["arthouse"],
  a24: ["arthouse"],
  arthouse: ["arthouse"],
  radiohead: ["indie", "shoegaze", "dream pop"],
  date: ["intimate", "cozy"],
  couple: ["intimate", "cozy"],
  night: ["intimate", "velvet"],
};

const STOPWORDS = new Set(["the", "and", "for", "with", "who", "that", "love", "loves", "into", "from", "this", "are", "our"]);
const MIN_TOKEN_CHARS = 3;

/** Lowercase word tokens, crudely singularised ("cafes" to "cafe"), stopwords dropped. */
export function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= MIN_TOKEN_CHARS && !STOPWORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

const haystack = (tag: { id: string; name: string }): string =>
  `${tag.name} ${tag.id.split(":").pop() ?? ""}`.toLowerCase().replace(/[_-]+/g, " ");

/** How many query tokens (directly or via synonyms) hit this tag; 0 means no match. */
export function tagMatchScore(tag: { id: string; name: string }, query: string): number {
  const hay = haystack(tag);
  const q = query.toLowerCase().trim();
  let score = q !== "" && hay.includes(q) ? 2 : 0;
  for (const token of queryTokens(q)) {
    const terms = [token, ...(TAG_SYNONYMS[token] ?? [])];
    if (terms.some((t) => hay.includes(t))) score += 1;
  }
  return score;
}
