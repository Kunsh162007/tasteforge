/**
 * Display names from Qloo. Some come with the possessive apostrophe turned into a space ("Buddy S Burger", from the slug
 * `buddy_s_burger`); put it back. Only a lone capital S after a word of two or more letters counts, so "Vitamin C" and
 * "Bar S" style single-letter cases and ordinary words are left alone.
 */
const BROKEN_POSSESSIVE = /\b([A-Za-z]{2,}) S(?=\s|$)/g;

export const fixPossessive = (name: string): string => name.replace(BROKEN_POSSESSIVE, "$1's");

/** A readable name for an id whose entry has no display name: the last slug segment, spaced and with possessives restored. */
export function nameFromId(id: string): string {
  const slug = id.split(":").pop() ?? id;
  if (!/[_-]/.test(slug)) return id;
  const spaced = slug.replace(/[_-]+/g, " ").trim();
  if (spaced === "" || !/[a-z]/i.test(spaced)) return id;
  return fixPossessive(spaced.replace(/\b[a-z]/g, (c) => c.toUpperCase()));
}

/** Qloo's own display name when it has one (cleaned), otherwise a readable form of the id. */
export const displayName = (name: string | undefined, id: string): string => (name && name.trim() !== "" ? fixPossessive(name.trim()) : nameFromId(id));
