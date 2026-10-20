import { toSseFrame, type AgentEvent } from "@/lib/agent";

/** Shared plumbing for the streaming brief routes. */

export function jsonError(message: string, status: number, headers?: Record<string, string>): Response {
  return Response.json({ error: message }, { status, headers });
}

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

/**
 * Streams the events of one run as SSE and always ends with a `done` frame. If the client goes away the run
 * still finishes (so its work and its capacity slot are released), but nothing more is written.
 */
export function sseStream(run: (emit: (e: AgentEvent) => void) => Promise<boolean>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let open = true;
  return new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent | { type: "done"; ok: boolean }): void => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(toSseFrame(e)));
        } catch {
          open = false; // the reader is gone
        }
      };
      let ok = false;
      try {
        ok = await run(emit);
      } catch (e) {
        console.warn(`[tasteforge] stream failed: ${e instanceof Error ? e.message : "unknown error"}`);
        emit({ type: "error", message: "Something went wrong while building your brief. Please try again.", retryable: true });
      }
      emit({ type: "done", ok });
      if (open) controller.close();
    },
    cancel() {
      open = false;
    },
  });
}
