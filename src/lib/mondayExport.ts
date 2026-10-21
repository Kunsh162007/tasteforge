import type { MondayList } from "./mondayList";

/** Plain-text and standalone-HTML renderings of the Monday list, for copying, downloading and printing. */

const bullet = (s: string): string => `  [ ] ${s}`;

export function mondayText(m: MondayList): string {
  const section = (title: string, lines: readonly string[]): string[] => (lines.length > 0 ? ["", title.toUpperCase(), ...lines.map(bullet)] : []);
  return [
    `MONDAY LIST: ${m.title}${m.city ? ` (${m.city})` : ""}`,
    ...section("Press play (a playlist, search each on Spotify)", m.playlist.map((p) => `${p.name}: ${p.url}`)),
    ...section("Paint and style (colours)", m.palette.map((c) => `${c.name} ${c.hex}`)),
    ...section("Visit three rooms before you open", m.places.map((p) => (p.where ? `${p.name}, ${p.where}` : p.name))),
    ...section("Put on the board", m.menu.map((i) => (i.why ? `${i.name}. ${i.why}` : i.name))),
    ...section("Say it (copy lines)", m.copy),
    ...section("Hand out flyers in", m.flyers.map((f) => (f.note ? `${f.name}: ${f.note}` : f.name))),
    "",
    "Made with TasteForge from Qloo taste-graph evidence.",
  ].join("\n");
}

const ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Everything in the list comes from a language model or an external API, so it is escaped before it reaches HTML. */
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

const safeHex = (hex: string): string => (/^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : "#cccccc");

/** Only https links are kept; anything else (a javascript: URL) falls back to plain text. */
const isHttps = (url: string): boolean => /^https:\/\//i.test(url);

const CSS = `body{font:16px/1.5 Georgia,serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#15171c}h1{font-size:1.9rem;margin:0}h2{font-size:.85rem;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid #999;padding-bottom:.2rem;margin-top:1.4rem}ul{list-style:none;padding:0}li{padding:.15rem 0 .15rem 1.6rem;position:relative}li:before{content:"";position:absolute;left:0;top:.45rem;width:.8rem;height:.8rem;border:1.5px solid #15171c}.chip{display:inline-block;width:1.1rem;height:1.1rem;vertical-align:-.15rem;border:1px solid #15171c;margin-right:.4rem}small{color:#555}footer{margin-top:2rem;color:#555;font-size:.85rem}@media print{body{margin:0;max-width:none;font-size:11pt}a{color:inherit}h2{break-after:avoid}.chip{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;

export function mondayHtml(m: MondayList): string {
  const list = (items: readonly string[]): string => (items.length > 0 ? `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>` : "");
  const section = (title: string, items: readonly string[]): string => (items.length > 0 ? `<h2>${escapeHtml(title)}</h2>${list(items)}` : "");
  const link = (name: string, url: string): string => (isHttps(url) ? `<a href="${escapeHtml(url)}">${escapeHtml(name)}</a>` : escapeHtml(name));
  const small = (text: string | undefined): string => (text ? ` <small>${escapeHtml(text)}</small>` : "");
  const body = [
    section("Press play: a playlist (search each on Spotify)", m.playlist.map((p) => link(p.name, p.url))),
    section("Paint and style", m.palette.map((c) => `<span class="chip" style="background:${safeHex(c.hex)}"></span>${escapeHtml(c.name)}${small(c.hex)}`)),
    section("Visit three rooms before you open", m.places.map((p) => `${escapeHtml(p.name)}${small(p.where)}`)),
    section("Put on the board", m.menu.map((i) => `${escapeHtml(i.name)}${small(i.why)}`)),
    section("Say it", m.copy.map(escapeHtml)),
    section("Hand out flyers in", m.flyers.map((f) => `${escapeHtml(f.name)}${small(f.note)}`)),
  ].join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Monday list: ${escapeHtml(m.title)}</title><style>${CSS}</style></head><body><h1>Monday list</h1><p>${escapeHtml(m.title)}${small(m.city)}</p>${body}<footer>Made with TasteForge from Qloo taste-graph evidence.</footer></body></html>`;
}
