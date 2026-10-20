import { describe, expect, it } from "vitest";
import { createSseParser, parseSseFrame } from "../sse";
import { INITIAL_RUN, reduceEvent, describeCall } from "../runState";

const frame = (type: string, extra: object = {}) => `event: ${type}\ndata: ${JSON.stringify({ type, ...extra })}\n\n`;

describe("parseSseFrame", () => {
  it("parses a data line into an event", () => {
    expect(parseSseFrame('event: done\ndata: {"type":"done"}')).toEqual({ type: "done" });
  });

  it("returns null for malformed JSON, missing data, or missing type", () => {
    expect(parseSseFrame("data: {oops")).toBeNull();
    expect(parseSseFrame("event: ping")).toBeNull();
    expect(parseSseFrame('data: {"nope":1}')).toBeNull();
  });
});

describe("createSseParser", () => {
  it("emits several events from one chunk", () => {
    const parser = createSseParser();
    const events = parser.push(frame("thinking", { text: "hm" }) + frame("done"));
    expect(events.map((e) => e.type)).toEqual(["thinking", "done"]);
  });

  it("reassembles a frame split across chunks, including inside the JSON", () => {
    const parser = createSseParser();
    const whole = frame("error", { message: "busy", retryable: true });
    const cut = Math.floor(whole.length / 2);
    expect(parser.push(whole.slice(0, cut))).toEqual([]);
    expect(parser.push(whole.slice(cut))).toEqual([{ type: "error", message: "busy", retryable: true }]);
  });

  it("handles CRLF separators and flushes a trailing frame without a blank line", () => {
    const parser = createSseParser();
    expect(parser.push('data: {"type":"done"}\r\n\r\n')).toHaveLength(1);
    expect(parser.push('data: {"type":"done"}')).toEqual([]);
    expect(parser.flush()).toEqual([{ type: "done" }]);
  });
});

describe("reduceEvent", () => {
  it("marks stages and builds a readable trail from tool events", () => {
    let s = reduceEvent(INITIAL_RUN, { type: "stage", stage: "walk", status: "start" });
    expect(s.stages.walk.status).toBe("active");
    s = reduceEvent(s, { type: "tool_call", id: "c1", name: "qloo_insights", args: { type: "place", location: "Indore" } });
    s = reduceEvent(s, { type: "tool_result", id: "c1", name: "qloo_insights", ok: true, summary: "12 results", evidenceId: "ev_1" });
    expect(s.trail[0].text).toBe("Searched places loved by this audience in Indore: 12 results");
    expect(s.evidence).toEqual({});
  });

  it("moves to needs_input and carries the backend retryable flag", () => {
    const asked = reduceEvent(INITIAL_RUN, { type: "needs_input", question: "Which?", options: [] });
    expect(asked.phase).toBe("needs_input");
    const failed = reduceEvent(INITIAL_RUN, { type: "error", message: "Unavailable.", retryable: true });
    expect(failed.error?.retryable).toBe(true);
    const fatal = reduceEvent(INITIAL_RUN, { type: "error", message: "Bad input.", retryable: false });
    expect(fatal.error?.retryable).toBe(false);
  });

  it("describeCall falls back gracefully for unknown tools", () => {
    expect(describeCall("mystery", {})).toBe("Called mystery");
  });
});
