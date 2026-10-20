import { ENTITY_TYPES } from "../types";
import { demographicsCheck, scoringCheck, tagParamCheck, trendingCheck, typeSpellingChecks } from "./apiChecks";
import { attempt } from "./helpers";
import { placeChecks, resolveSeedEntities } from "./placeChecks";
import { result, type CheckContext, type CheckResult } from "./types";

export { formatReport, summarize } from "./report";
export { linkVerifyItems, scanVerifyItems, VERIFY_MARKER } from "./verifyItems";
export { LIVE_SEED_NAMES, MOCK_SEED_NAMES } from "./placeChecks";
export type { CheckContext, CheckResult, CheckStatus, Probe, SeedNames } from "./types";

/** Cities from the plan's P4 risk table. */
export const DEMO_CITIES: readonly string[] = ["Indore", "London", "Brooklyn"];

/** A bad key or base URL fails everything; say so once instead of repeating the same error per check. */
async function authCheck(ctx: CheckContext): Promise<CheckResult> {
  const r = await attempt(() => ctx.client.search({ query: "Radiohead", types: [ENTITY_TYPES.artist], take: 1 }));
  if (r.ok) return result("auth", "Connection", "PASS", "API reachable and the key was accepted");
  return result("auth", "Connection", "FAIL", `${r.message}`, "Set QLOO_API_KEY to the hackathon key and keep QLOO_BASE_URL=https://hackathon.api.qloo.com. All other checks were skipped.");
}

/** Runs the P4 risk checks and every `VERIFY with live key` item. Never throws and never returns raw payloads. */
export async function runChecks(ctx: CheckContext): Promise<CheckResult[]> {
  const auth = await authCheck(ctx);
  if (auth.status === "FAIL") return [auth];
  const seeded = await resolveSeedEntities(ctx);
  const { seeds } = seeded;
  const places = await placeChecks(ctx, seeds);
  const [scoring, demographics, trending, spellings, tagParam] = await Promise.all([
    scoringCheck(ctx, seeds),
    demographicsCheck(ctx, seeds),
    trendingCheck(ctx, seeds),
    typeSpellingChecks(ctx, seeds),
    tagParamCheck(ctx),
  ]);
  return [auth, ...seeded.results, ...places.results, scoring, demographics, trending, ...spellings, tagParam];
}
