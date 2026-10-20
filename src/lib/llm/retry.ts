import { LlmError } from "./types";

export type RetryOptions = {
  readonly retries: number;
  readonly baseDelayMs: number;
  readonly sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Retries retryable LlmErrors (429, 5xx, network, timeout) with exponential backoff. */
export async function withRetry<T>(fn: () => Promise<T>, o: RetryOptions): Promise<T> {
  const sleep = o.sleep ?? defaultSleep;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      const canRetry = e instanceof LlmError && e.retryable && attempt < o.retries;
      if (!canRetry) throw e;
      await sleep(o.baseDelayMs * 2 ** attempt);
      attempt += 1;
    }
  }
}
