import type { BriefRequestBody, CompareRequestBody, RefineRequestBody, UiEvent } from "./contract";
import { createSseParser } from "./sse";

export class BriefStreamError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** POSTs to /api/brief and emits each SSE event. Throws BriefStreamError on HTTP failure. */
export const streamBrief = (body: BriefRequestBody, onEvent: (event: UiEvent) => void, signal?: AbortSignal): Promise<void> =>
  streamFrom("/api/brief", body, onEvent, signal);

/** POSTs feedback to /api/brief/refine; the stream has the same events as a normal run. */
export const streamRefine = (body: RefineRequestBody, onEvent: (event: UiEvent) => void, signal?: AbortSignal): Promise<void> =>
  streamFrom("/api/brief/refine", body, onEvent, signal);

/** POSTs to /api/brief/compare; the stream has the same events as a normal run, minus the proof. */
export const streamCompare = (body: CompareRequestBody, onEvent: (event: UiEvent) => void, signal?: AbortSignal): Promise<void> =>
  streamFrom("/api/brief/compare", body, onEvent, signal);

async function streamFrom(url: string, body: unknown, onEvent: (event: UiEvent) => void, signal?: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new BriefStreamError("We could not reach the server. Check your connection and try again.", true);
  }
  if (!res.ok || !res.body) {
    const retryable = res.status === 429 || res.status >= 500;
    let message = retryable
      ? "The studio is busy right now. Give it a moment and try again."
      : "That request could not be processed.";
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      // keep default message
    }
    throw new BriefStreamError(message, retryable);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true })).forEach(onEvent);
  }
  parser.flush().forEach(onEvent);
}
