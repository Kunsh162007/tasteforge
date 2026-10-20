import type { UiEvent } from "./contract";

/** Parses one SSE frame (lines of `event:`/`data:`) into an event, or null if unusable. */
export function parseSseFrame(frame: string): UiEvent | null {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  if (!data) return null;
  try {
    const parsed: unknown = JSON.parse(data);
    if (parsed && typeof parsed === "object" && typeof (parsed as { type?: unknown }).type === "string") {
      return parsed as UiEvent;
    }
  } catch {
    // Malformed frame: ignore rather than break the stream.
  }
  return null;
}

export type SseParser = { push(chunk: string): UiEvent[]; flush(): UiEvent[] };

/** Incremental parser: chunks may split frames anywhere. */
export function createSseParser(): SseParser {
  let buffer = "";
  const drain = (final: boolean): UiEvent[] => {
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = final ? "" : (parts.pop() ?? "");
    return parts.flatMap((p) => {
      const event = parseSseFrame(p);
      return event ? [event] : [];
    });
  };
  return {
    push(chunk) {
      buffer += chunk;
      return drain(false);
    },
    flush() {
      return drain(true);
    },
  };
}
