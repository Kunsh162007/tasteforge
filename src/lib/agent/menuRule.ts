import type { Item } from "./brief";
import { joinSentences } from "../sentences";
import type { Evidence, Ledger } from "./ledger";

/**
 * Menu and merch ideas in the pairings are the writer's own words, which is where "Post-Punk Pepperoni Pizza" came from: a
 * dish nobody's data mentions, dressed in the audience's music. A menu idea is kept only when every word in it comes from
 * the Qloo food tags (cuisines, dishes, drinks) in the evidence; music, audience and lifestyle tags never count. The writer may name and combine; it may not add.
 */

/** Words that build a menu line without naming food: they carry no claim about the audience. */
const FORMAT_WORDS = new Set([
  "plate", "plates", "board", "bowl", "bowls", "special", "specials", "platter", "flight", "pairing", "pairings", "tasting", "set", "menu",
  "with", "and", "the", "a", "an", "of", "on", "in", "for", "to", "or", "by", "house", "signature", "seasonal", "small", "shared", "side",
]);

const words = (text: string): string[] =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);

/** Crude singular, so "Dumplings" in a tag covers "dumpling" in a menu line. */
const stem = (w: string): string => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

/** Tag type families that name something you can serve: cuisines, dishes, drinks, food and restaurant-type genres. */
const FOOD_TAG = /^urn:tag:(?:cuisine|specialty_dish|offerings?|dish(?:es)?|drinks?|beverages?|food|menu)(?::|$)|^urn:tag:genre:place:(?:restaurant|bar|cafe|bakery|brewery|coffee)/;
const FOOD_TAG_TYPE = /(?:cuisine|specialty_dish|offerings?|dish|drink|beverage|food|menu|genre:place:(?:restaurant|bar|cafe|bakery|brewery|coffee))/;

/**
 * Whether a tag may inspire a menu idea. A full tag URN decides on its own type (music, audience and lifestyle tags never
 * do); a bare id falls back to the tag types the record was fetched with, which must all be food types.
 */
export function isFoodTag(tagId: string, record: Pick<Evidence, "params">): boolean {
  if (tagId.startsWith("urn:tag:")) return FOOD_TAG.test(tagId);
  const types = (record.params.tag_types ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  return types.length > 0 && types.every((t) => FOOD_TAG_TYPE.test(t));
}

/** The food, drink and cuisine tags in the evidence: the only source of menu ideas. */
export function foodTags(ledger: Ledger): { readonly name: string }[] {
  return ledger.records.flatMap((r) => (r.tags ?? []).filter((t) => isFoodTag(t.id, r)));
}

/** Every word the evidence uses for food and drink: the names of its cuisine, dish and drink tags only. */
export function evidenceVocabulary(ledger: Ledger): Set<string> {
  const vocab = new Set<string>();
  for (const t of foodTags(ledger)) for (const w of words(t.name)) vocab.add(stem(w));
  return vocab;
}

/** The tag names (from any record) that share a word with the menu line: what to cite as its source. */
export function sourceTags(label: string, ledger: Ledger): string[] {
  const mine = new Set(words(label).map(stem));
  const found = new Set<string>();
  for (const t of foodTags(ledger)) if (words(t.name).some((w) => mine.has(stem(w)))) found.add(t.name);
  return [...found].slice(0, 3);
}

export type MenuVerdict = { readonly ok: true; readonly sources: readonly string[] } | { readonly ok: false; readonly unknown: readonly string[] };

/** Whether every content word of a menu line appears in the evidence. */
export function checkMenuIdea(label: string, vocab: ReadonlySet<string>, ledger: Ledger): MenuVerdict {
  const content = words(label)
    .map(stem)
    .filter((w) => !FORMAT_WORDS.has(w) && w.length > 2 && !/^\d+$/.test(w));
  const unknown = content.filter((w) => !vocab.has(w));
  if (content.length === 0 || unknown.length > 0) return { ok: false, unknown };
  return { ok: true, sources: sourceTags(label, ledger) };
}

/** True when the item is a Qloo brand entity (cited records list its id) and so needs no menu check. */
export function isEntityItem(item: Pick<Item, "qlooId" | "evidence">, ledger: Ledger): boolean {
  if (!item.qlooId) return false;
  return ledger.records.some((r) => item.evidence.includes(r.id) && (r.entities ?? []).some((e) => e.id === item.qlooId));
}

/** The detail line for a kept menu idea: what the writer said, plus where the idea comes from. */
export function withProvenance(item: Item, sources: readonly string[]): Item {
  if (sources.length === 0) return item;
  const note = `Creative suggestion from Qloo tags: ${sources.join(", ")}.`;
  return { ...item, detail: item.detail ? joinSentences(item.detail, note) : note };
}
