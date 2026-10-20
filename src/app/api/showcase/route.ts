import { after, connection, NextResponse } from "next/server";
import { generateBrief } from "@/lib/agent";
import { getGeocoder } from "@/lib/geo/geocoder";
import { allowShowcaseRetry } from "@/lib/http/guards";
import { getLlm, getQloo } from "@/lib/http/deps";
import { clientIp } from "@/lib/http/request";
import { getLedgerSigner } from "@/lib/security/ledgerSig";
import { createShowcaseService, SHOWCASE_TIMEOUT, type ShowcaseEntry, type ShowcaseService } from "@/lib/showcase";
import { singleton } from "@/lib/singleton";

// Generation continues after the response (via `after`), so allow the full function budget.
export const maxDuration = 120;

// One service per server instance, kept across dev hot reloads.
const getService = (): ShowcaseService =>
  singleton("showcase", () =>
    createShowcaseService({
      generate: (def, onEvent) =>
        generateBrief({
          prompt: def.prompt,
          mode: def.mode,
          city: def.city,
          llm: getLlm(),
          qloo: getQloo(),
          geocode: getGeocoder(),
          onEvent,
          allowNeedsInput: false,
          timeoutMs: SHOWCASE_TIMEOUT,
        }),
    }),
  );

/** True while something is still to be built or will be retried automatically. */
const hasPendingWork = (items: readonly ShowcaseEntry[]): boolean =>
  items.some((i) => i.status === "queued" || i.status === "generating" || (i.status === "failed" && i.nextRetryAt !== undefined));

/** Ready entries carry the server's signatures so refine, compare and share links can be verified later. */
function withSignatures(item: ShowcaseEntry): ShowcaseEntry & { signatures?: ReturnType<ReturnType<typeof getLedgerSigner>["sign"]> } {
  if (item.status !== "ready" || !item.evidence) return item;
  return { ...item, signatures: getLedgerSigner().sign({ evidence: item.evidence, signals: item.signals }) };
}

/**
 * Cached showcase briefs. A request starts (or resumes) generation of whatever is missing, one brief at a time;
 * `?retry=1` clears the failure backoff so the user can retry failed briefs right away. Retrying costs LLM calls,
 * so it is rate limited: a few per visitor, and one per minute for the whole server. A refused retry is
 * answered like a plain request.
 */
export async function GET(req: Request): Promise<Response> {
  await connection(); // opt out of build-time prerendering: results are per-server state
  const service = getService();
  const retry = new URL(req.url).searchParams.get("retry") === "1" && allowShowcaseRetry(clientIp(req));
  const items = service.list();
  if (retry || hasPendingWork(items)) after(() => service.ensure({ force: retry }));
  // Report the state as of now: a forced retry shows its failed items as queued right away.
  const state = retry ? items.map((i) => (i.status === "failed" ? { ...i, status: "queued" as const, nextRetryAt: undefined } : i)) : items;
  return NextResponse.json({ items: state.map(withSignatures) }, { headers: { "Cache-Control": "no-store" } });
}
