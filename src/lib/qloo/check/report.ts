import type { VerifyRow } from "./verifyItems";
import type { CheckResult, CheckStatus } from "./types";

const COLOURS: Record<CheckStatus, string> = { PASS: "\u001b[32m", WARN: "\u001b[33m", FAIL: "\u001b[31m", SKIP: "\u001b[90m" };
const RESET = "\u001b[0m";

export type Summary = Readonly<Record<CheckStatus, number>>;

export function summarize(results: readonly CheckResult[]): Summary {
  const base: Record<CheckStatus, number> = { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 };
  for (const r of results) base[r.status] += 1;
  return base;
}

const badge = (s: CheckStatus, colour: boolean): string => (colour ? `${COLOURS[s]}${s.padEnd(4)}${RESET}` : s.padEnd(4));

/** Plain-text PASS/FAIL/WARN table, then the recommended fix for every non-passing check. */
export function formatReport(results: readonly CheckResult[], verify: readonly VerifyRow[], colour = false): string {
  const idWidth = Math.max(5, ...results.map((r) => r.id.length));
  const lines: string[] = ["", `${"STAT".padEnd(4)}  ${"CHECK".padEnd(idWidth)}  RESULT`, `${"----".padEnd(4)}  ${"-".repeat(idWidth)}  ------`];
  for (const r of results) lines.push(`${badge(r.status, colour)}  ${r.id.padEnd(idWidth)}  ${r.detail}`);

  const fixes = results.filter((r) => r.fix && (r.status === "FAIL" || r.status === "WARN"));
  if (fixes.length > 0) {
    lines.push("", "RECOMMENDED FIXES");
    for (const r of fixes) lines.push(`  [${r.status}] ${r.id}: ${r.fix}`);
  }

  lines.push("", `VERIFY WITH LIVE KEY ITEMS IN THE CODE (${verify.length})`);
  for (const v of verify) lines.push(`${badge(v.status, colour)}  ${v.item.file}:${v.item.line}  ->  ${v.checks}`, `        ${v.item.text}`);

  const s = summarize(results);
  lines.push("", `SUMMARY: ${s.PASS} pass, ${s.WARN} warn, ${s.FAIL} fail, ${s.SKIP} skipped`, "");
  return lines.join("\n");
}
