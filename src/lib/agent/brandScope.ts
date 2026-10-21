import type { QlooEntity } from "@/lib/qloo";

/**
 * Brand pairings are for a cafe, bar, shop or studio: coffee roasters, fashion labels, makers. Qloo's brand type
 * also holds news sites, photo agencies, universities, NGOs and apps (a New York brief once paired a cafe with Getty
 * Images, Vice and Academy of Art University). The brand's own Qloo tags say which is which, so media, agency,
 * education and app brands are set aside unless the request is about that world.
 */

export type BrandScope = "consumer" | "any";

/** Words in a Qloo tag name that mark a brand as media, an agency, a school, an NGO or software. */
const NON_CONSUMER = [
  /\bmedia\b/,
  /\bnews\b/,
  /\bpublish/,
  /\bmagazines?\b/,
  /\btelevision\b/,
  /\bbroadcast/,
  /\bphoto agenc/,
  /\bstock photo/,
  /\bacademic\b/,
  /\buniversit/,
  /\bcolleges?\b/,
  /\bschools?\b/,
  /\beducation/,
  /\bngo\b/,
  /\badvocacy\b/,
  /\bnonprofit\b/,
  /\bstreaming\b/,
  /\bmobile app\b/,
  /\bnews app\b/,
  /\badvertising agenc/,
  /\bwebsites?\b/,
  /\binternet\b/,
  /\bsoftware\b/,
  /\bsocial network/,
  /\bgovernment\b/,
  /\bsatir/,
  /\btravel (?:agenc|authorit)/,
] as const;

/** A request that is itself about media, publishing or teaching keeps those brands (loving A24 films or film photography does not count). */
const MEDIA_PROMPT = /\b(magazines?|zines?|publish\w*|media|newsletters?|podcasts?|film (?:studio|school|festival|label)|record label|school|university|academy|courses?|classes|workshops?)\b/i;

export const impliesMedia = (prompt: string): boolean => MEDIA_PROMPT.test(prompt);

export const brandScopeFor = (prompt: string): BrandScope => (impliesMedia(prompt) ? "any" : "consumer");

/** Why a brand is not a consumer or hospitality brand, from its tags; undefined when nothing marks it. */
export function nonConsumerReason(e: Pick<QlooEntity, "tags">): string | undefined {
  for (const t of e.tags ?? []) {
    const name = t.name.toLowerCase();
    if (NON_CONSUMER.some((re) => re.test(name))) return t.name;
  }
  return undefined;
}

/** The brands a pairing may use. A brand without tags is kept (nothing says it is not consumer-facing). */
export function consumerBrands<T extends Pick<QlooEntity, "tags">>(brands: readonly T[], scope: BrandScope): T[] {
  return scope === "any" ? [...brands] : brands.filter((b) => nonConsumerReason(b) === undefined);
}
