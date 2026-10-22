import type { Brief, Item } from "./agent/brief";
import { isEntityItem } from "./agent/menuRule";
import type { Evidence } from "./agent/ledger";
import { tidyNote } from "./sentences";

/**
 * The "Monday list": what a founder can actually do on Monday morning, taken from a finished brief. Pure: the same brief
 * always gives the same list, and nothing here comes from anywhere but the brief and the evidence it cites.
 */

export type MenuKind = "idea" | "collab";

/** How each menu entry is labelled in the list and its exports. */
export const MENU_KIND_LABEL: Readonly<Record<MenuKind, string>> = { idea: "Menu idea", collab: "Brand collab" };

export type MondayList = {
  readonly title: string;
  readonly city?: string;
  /** Artists for a playlist, each with a Spotify search link (the app does not log in to Spotify). */
  readonly playlist: readonly { readonly name: string; readonly url: string }[];
  readonly palette: readonly { readonly name: string; readonly hex: string }[];
  /** Rooms worth visiting before opening. */
  readonly places: readonly { readonly name: string; readonly where?: string }[];
  /** Menu or merch ideas for the board. */
  readonly menu: readonly { readonly name: string; readonly kind: MenuKind; readonly why?: string }[];
  readonly copy: readonly string[];
  /** Neighbourhoods to hand out flyers in. */
  readonly flyers: readonly { readonly name: string; readonly note?: string }[];
};

export const PLAYLIST_SIZE = 10;
export const PLACES = 3;
export const MENU_IDEAS = 2;
export const COPY_LINES = 3;
export const FLYER_AREAS = 3;

export const spotifySearchUrl = (name: string): string => `https://open.spotify.com/search/${encodeURIComponent(name)}`;

const isPlaceholder = (name: string): boolean => /^area near\b/i.test(name);

/** The street address Qloo has on file for a place, from the first part of its note. */
function addressOf(item: Item, evidence: Readonly<Record<string, Evidence>>): string | undefined {
  for (const id of item.evidence) {
    const hit = evidence[id]?.entities?.find((e) => e.id === item.qlooId);
    const first = hit?.note?.split(" | ")[0]?.trim();
    if (first) return first;
  }
  return undefined;
}

/**
 * Menu and merch ideas first (the writer's ideas, each built from Qloo tags); when the brief has fewer than two, brand
 * collaborations fill the rest, so the list is never empty because of how pairings were split.
 */
function menuIdeas(brief: Brief, evidence: Readonly<Record<string, Evidence>>): MondayList["menu"] {
  const ledger = { records: Object.values(evidence) };
  const ideas = brief.pairings.filter((p) => !isEntityItem(p, ledger));
  const brands = brief.pairings.filter((p) => isEntityItem(p, ledger));
  const pick = [...ideas, ...brands].slice(0, MENU_IDEAS);
  return pick.map((p) => ({
    name: p.label,
    kind: isEntityItem(p, ledger) ? ("collab" as const) : ("idea" as const),
    ...(p.detail ? { why: tidyNote(p.detail) } : {}),
  }));
}

export function buildMondayList(brief: Brief, evidence: Readonly<Record<string, Evidence>>): MondayList {
  const hotspots = brief.whereTheyAre?.hotspots ?? [];
  return {
    title: brief.title,
    ...(brief.whereTheyAre?.city ? { city: brief.whereTheyAre.city } : {}),
    playlist: brief.sound.artists.slice(0, PLAYLIST_SIZE).map((a) => ({ name: a.label, url: spotifySearchUrl(a.label) })),
    palette: brief.aesthetic.palette.map((s) => ({ name: s.label, hex: s.hex.toUpperCase() })),
    places: brief.aesthetic.referencePlaces.slice(0, PLACES).map((p) => {
      const where = addressOf(p, evidence) ?? p.detail;
      return { name: p.label, ...(where ? { where } : {}) };
    }),
    menu: menuIdeas(brief, evidence),
    copy: brief.messaging.phrases.slice(0, COPY_LINES),
    flyers: hotspots
      .filter((h) => !isPlaceholder(h.label))
      .slice(0, FLYER_AREAS)
      .map((h) => ({ name: h.label, ...(h.detail ? { note: h.detail } : {}) })),
  };
}

/** The page subtitle: the title, plus the city unless the title already says it ("Chicago, Chicago" otherwise). */
export function mondaySubtitle(m: Pick<MondayList, "title" | "city">): string {
  const city = m.city?.trim();
  const named = city !== undefined && city !== "" && !m.title.toLowerCase().includes(city.toLowerCase());
  return named ? `${m.title}, ${city}` : m.title;
}

/** True when the list has nothing to act on (every part empty). */
export const isEmptyMonday = (m: MondayList): boolean =>
  m.playlist.length + m.palette.length + m.places.length + m.menu.length + m.copy.length + m.flyers.length === 0;
