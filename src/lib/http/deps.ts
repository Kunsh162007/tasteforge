import { getGeocoder } from "@/lib/geo/geocoder";
import type { ReverseGeocoder } from "@/lib/geo/nominatim";
import { createLlm, type LlmProvider } from "@/lib/llm";
import { createQlooClientFromEnv, type QlooClient } from "@/lib/qloo";
import { singleton } from "@/lib/singleton";
import { getBudget } from "./budget";

/**
 * The LLM and Qloo clients are built once per server process. Their caches (LLM JSON answers, Qloo responses)
 * only help if every request sees the same instance, and the LLM counts its calls against the daily budget.
 */

export type RouteDeps = {
  readonly llm: LlmProvider;
  readonly qloo: QlooClient;
  readonly geocode: ReverseGeocoder | undefined;
};

export const getLlm = (): LlmProvider => singleton("llm", () => createLlm(undefined, { onCall: () => getBudget().recordCall() }));

export const getQloo = (): QlooClient => singleton("qloo", () => createQlooClientFromEnv());

/** Throws when the environment is not configured (missing keys); callers answer 503. */
export function getRouteDeps(): RouteDeps {
  return { llm: getLlm(), qloo: getQloo(), geocode: getGeocoder() };
}
