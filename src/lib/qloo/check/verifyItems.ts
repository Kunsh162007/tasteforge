import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { CheckResult, CheckStatus } from "./types";

/** Finds every `VERIFY with live key` marker in the source and links it to the check that settles it. */

export const VERIFY_MARKER = "VERIFY with live key";

export type VerifyItem = { readonly file: string; readonly line: number; readonly text: string };

const SKIP_DIRS = new Set(["node_modules", ".next", "check"]);
const SOURCE_FILE = /\.(ts|tsx|mts)$/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(join(dir, entry.name));
    } else if (SOURCE_FILE.test(entry.name) && !entry.name.includes(".test.")) {
      yield join(dir, entry.name);
    }
  }
}

/** Scans `dir` (normally `src`). Paths are reported relative to `root`, with forward slashes. */
export function scanVerifyItems(dir: string, root: string = dir): VerifyItem[] {
  const items: VerifyItem[] = [];
  for (const file of walk(dir)) {
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((text, i) => {
        if (text.includes(VERIFY_MARKER)) items.push({ file: relative(root, file).split("\\").join("/"), line: i + 1, text: text.trim().replace(/^\/\/\s*/, "") });
      });
  }
  return items.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** Check-id prefixes that settle each kind of marker. */
const LINKS: readonly { readonly match: RegExp; readonly checks: string }[] = [
  { match: /area name|heatmap|boundary/i, checks: "heatmap.cells" },
  { match: /tag search/i, checks: "tags.search_param" },
  { match: /destination|locality/i, checks: "types.destination" },
  { match: /video_game|videogame/i, checks: "types.video_game" },
];

export type VerifyRow = { readonly item: VerifyItem; readonly checks: string; readonly status: CheckStatus };

const SEVERITY: Record<CheckStatus, number> = { FAIL: 3, WARN: 2, SKIP: 1, PASS: 0 };

/** Pairs each marker with the worst status among its linked checks; unlinked markers are reported as WARN. */
export function linkVerifyItems(items: readonly VerifyItem[], results: readonly CheckResult[]): VerifyRow[] {
  return items.map((item) => {
    const link = LINKS.find((l) => l.match.test(item.text));
    if (!link) return { item, checks: "(no check yet)", status: "WARN" };
    const linked = results.filter((r) => r.id === link.checks || r.id.startsWith(`${link.checks}.`));
    const worst = linked.reduce<CheckStatus | undefined>((w, r) => (w === undefined || SEVERITY[r.status] > SEVERITY[w] ? r.status : w), undefined);
    return { item, checks: link.checks, status: worst ?? "SKIP" };
  });
}
