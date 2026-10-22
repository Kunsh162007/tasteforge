import { LlmError } from "@/lib/llm";
import { logWarn } from "@/lib/log";
import { QlooError } from "@/lib/qloo";

/** Shared failure handling: deadlines and key-free, user-friendly error descriptions. */

export class TimeoutError extends Error {}

export function withDeadline<T>(work: Promise<T>, remainingMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError("deadline")), Math.max(remainingMs, 1));
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

export type Failure = {
  /** Human message safe to show in the UI. */
  readonly message: string;
  /** Whether trying again may succeed (rate limits, outages, timeouts). */
  readonly retryable: boolean;
  /** Key-free diagnostic for server logs, e.g. "groq rate_limit HTTP 429". */
  readonly cause?: string;
};

export function describeCause(e: unknown): string | undefined {
  if (e instanceof LlmError) return `${e.provider} ${e.kind}${e.status ? ` HTTP ${e.status}` : ""}`;
  if (e instanceof QlooError) return `qloo ${e.kind}${e.status ? ` HTTP ${e.status}` : ""}`;
  return undefined;
}

export function describeFailure(e: unknown): Failure {
  const cause = describeCause(e);
  const withCause = (f: Omit<Failure, "cause">): Failure => ({ ...f, ...(cause ? { cause } : {}) });
  if (e instanceof TimeoutError) {
    return withCause({ message: "The brief took too long to build. Please try again.", retryable: true });
  }
  if (e instanceof LlmError && e.kind === "auth") {
    return withCause({
      message: "The language model rejected the server credentials. Check the LLM API key configuration.",
      retryable: false,
    });
  }
  if (e instanceof LlmError) {
    return withCause({
      message: "The language model is unavailable right now (rate limit or outage). Please try again shortly.",
      retryable: true,
    });
  }
  if (e instanceof QlooError && e.kind === "auth") {
    return withCause({
      message: "The taste data service rejected the server credentials. Check the Qloo API key configuration.",
      retryable: false,
    });
  }
  if (e instanceof QlooError) {
    return withCause({
      message: "The taste data service is busy right now. Please try again shortly.",
      retryable: true,
    });
  }
  if (!cause) logWarn("unexpected failure", e);
  return withCause({ message: "The language model returned an unexpected error. Please try again.", retryable: true });
}
