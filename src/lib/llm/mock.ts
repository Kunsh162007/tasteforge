import type { JsonRequest, LlmProvider } from "./types";

export type MockLlm = LlmProvider & {
  /** Every JSON-mode request received, in order. */
  readonly jsonRequests: readonly JsonRequest[];
};

/** JSON-mode script entry: the parsed document to return, an Error to throw, or a function of the request. */
export type MockJsonStep = unknown;

/**
 * Scripted provider for tests. Each entry is a response, an Error to throw, or a function of the
 * request. Throws if the script is exhausted so over-long runs fail loudly.
 */
export function createMockLlm(jsonScript: readonly MockJsonStep[] = [], name = "mock"): MockLlm {
  const jsonRequests: JsonRequest[] = [];
  let jsonIndex = 0;
  return {
    name,
    jsonRequests,
    async chatJson(req: JsonRequest): Promise<unknown> {
      jsonRequests.push(req);
      if (jsonIndex >= jsonScript.length) throw new Error("mock LLM JSON script exhausted");
      const step = jsonScript[jsonIndex];
      jsonIndex += 1;
      if (step instanceof Error) throw step;
      return typeof step === "function" ? (step as (r: JsonRequest) => unknown)(req) : step;
    },
  };
}
