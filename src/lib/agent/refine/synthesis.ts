import type { LlmProvider } from "@/lib/llm";
import type { BriefDraft, BriefMode } from "../brief";
import { fence } from "../fence";
import { itemsAt, SLOTS, type SlotPath } from "../briefItems";
import type { Evidence, Ledger } from "../ledger";
import { isUsable } from "../pipeline/context";
import type { Signals } from "../pipeline/resolve";
import { createAliases, leanView, type Aliases } from "../pipeline/promptView";
import { derivePaletteFor, prepareReply, promptHeader, requestDraft, SYNTHESIS_SYSTEM_CODE_PALETTE } from "../pipeline/synthesis";
import type { RefinePlan } from "./plan";

/** One main-model JSON call that rewrites only the refreshed sections; the merge step enforces the keep/drop rules. */

const REFINE_SYSTEM = `${SYNTHESIS_SYSTEM_CODE_PALETTE}

REFINEMENT: the user reviewed an earlier brief and gave feedback. You are shown the previous items of the sections to regenerate.
- Items under KEEP stay exactly as they are, so do not rewrite them; just do not repeat them as new items.
- Items under REMOVED were rejected: never output them or close variants again.
- Replace the rest with fresh items that come from the new evidence records (use different entities where evidence allows). A refreshed list should end up as long as it was before: for every removed item add a new one from the new evidence.
- Still return the complete JSON object. Sections that are not being regenerated can be minimal; they are ignored.`;

export type RefineSynthesisInput = {
  readonly llm: LlmProvider;
  readonly prompt: string;
  readonly mode: BriefMode;
  readonly city?: string;
  readonly signals: Signals;
  readonly ledger: Ledger;
  readonly previous: BriefDraft;
  readonly plan: RefinePlan;
  /** Evidence ids that already existed before this refine run (their records are only shown if kept items cite them). */
  readonly existingIds: ReadonlySet<string>;
};

const labels = (items: readonly { label: string }[]): string[] => items.map((i) => i.label);

function describeLists(i: RefineSynthesisInput): string[] {
  return SLOTS.filter((s) => i.plan.keep.has(s.path)).map(({ path }) => {
    const keep = i.plan.keep.get(path) ?? [];
    const keepLabels = new Set(labels(keep));
    const removed = itemsAt(i.previous, path).filter((item) => !keepLabels.has(item.label) && i.plan.dislikedLabels.has(item.label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()));
    return `${path}: KEEP ${fence(JSON.stringify(labels(keep)))}; REMOVED ${fence(JSON.stringify(labels(removed)))}`;
  });
}

/** New records from this run plus the older records that kept items cite. */
function relevantRecords(i: RefineSynthesisInput): Evidence[] {
  const cited = new Set<string>();
  for (const items of i.plan.keep.values()) for (const item of items) item.evidence.forEach((id) => cited.add(id));
  return i.ledger.records.filter((r) => isUsable(r) && (!i.existingIds.has(r.id) || cited.has(r.id)));
}

export function buildRefinePrompt(i: RefineSynthesisInput, aliases: Aliases = createAliases(relevantRecords(i))): string {
  const paths: SlotPath[] = SLOTS.filter((s) => i.plan.keep.has(s.path)).map((s) => s.path);
  return [
    ...promptHeader(i),
    `Sections to regenerate: ${i.plan.sections.join(", ")}`,
    `Lists to refresh: ${paths.join(", ")}`,
    ...describeLists(i),
    "",
    "Evidence records (cite their evidence_id values):",
    JSON.stringify(relevantRecords(i).map((r) => leanView(r, aliases))),
  ].join("\n");
}

/** A refreshed palette is derived by code again from the whole ledger; the rejected colours change the hash, so it comes out different. */
function refreshedPalette(i: RefineSynthesisInput) {
  if (!i.plan.keep.has("aesthetic.palette")) return undefined;
  return derivePaletteFor(i.ledger, i.signals, [...i.plan.dislikedLabels].sort().join(","));
}

export function synthesizeRefinement(i: RefineSynthesisInput): Promise<BriefDraft> {
  const aliases = createAliases(relevantRecords(i));
  const derived = refreshedPalette(i);
  return requestDraft(i.llm, REFINE_SYSTEM, buildRefinePrompt(i, aliases), { prepare: prepareReply(aliases, derived) });
}
