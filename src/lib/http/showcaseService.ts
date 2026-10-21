import { generateBrief } from "@/lib/agent";
import { beginBaseline, finishProof } from "@/lib/agent/generate";
import { getGeocoder } from "@/lib/geo/geocoder";
import { createShowcaseService, SHOWCASE_TIMEOUT, type ShowcaseService } from "@/lib/showcase";
import { singleton } from "@/lib/singleton";
import { getLlm, getQloo } from "./deps";

/** Showcases build in the background, so their proof may take longer than a user would wait for one. */
const SHOWCASE_PROOF_TIMEOUT_MS = 60_000;

/** One showcase service per server instance, kept across dev hot reloads and shared by the API route and the boot warm-up. */
export const getShowcaseService = (): ShowcaseService =>
  singleton("showcase", () =>
    createShowcaseService({
      source: `${process.env.QLOO_MODE ?? "mock"}|${process.env.LLM_PROVIDER === "mock" ? "mock" : "llm"}`,
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
          proofTimeoutMs: SHOWCASE_PROOF_TIMEOUT_MS,
        }),
      reprove: (def, result, onEvent) => {
        const request = { llm: getLlm(), qloo: getQloo(), prompt: def.prompt, city: result.city ?? def.city, onEvent, proofTimeoutMs: SHOWCASE_PROOF_TIMEOUT_MS };
        return finishProof(request, beginBaseline(request, Promise.resolve(result.ledger)), result);
      },
    }),
  );

/** Pause before the boot warm-up starts, so the server is answering health checks first. */
const WARM_DELAY_MS = 3_000;

type Env = Readonly<Record<string, string | undefined>>;

/** Boot warm-up runs for a production server on live data (mock data is instant anyway); SHOWCASE_WARM_ON_BOOT=0 turns it off. */
export const shouldWarmOnBoot = (env: Env): boolean =>
  env.NODE_ENV === "production" && env.QLOO_MODE === "live" && env.SHOWCASE_WARM_ON_BOOT !== "0";

/**
 * Starts generating the showcase briefs one at a time as soon as the server is up, so they are cached before the first
 * visitor (or a judge) arrives. Returns whether a warm-up was scheduled; never throws.
 */
export function warmShowcaseOnBoot(env: Env = process.env, service: () => Pick<ShowcaseService, "ensure"> = getShowcaseService, log: (msg: string) => void = console.warn): boolean {
  if (!shouldWarmOnBoot(env)) return false;
  const timer = setTimeout(() => {
    try {
      void service()
        .ensure()
        .catch((e: unknown) => log(`[tasteforge] showcase warm-up failed: ${e instanceof Error ? e.message : "unknown error"}`));
    } catch (e) {
      log(`[tasteforge] showcase warm-up could not start: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  }, WARM_DELAY_MS);
  timer.unref?.();
  return true;
}
