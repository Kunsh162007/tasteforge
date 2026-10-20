import { describe, expect, it } from "vitest";
import { decodeShare } from "@/lib/share/codec";
import { demoRunState } from "../demoState";
import { shareLink, sharePayloadFromRun } from "../share";

const done = { ...demoRunState, request: { prompt: "A couple who love A24.", mode: "know_audience" as const, city: "Brooklyn" } };

describe("sharePayloadFromRun", () => {
  it("returns null until a brief is ready", () => {
    expect(sharePayloadFromRun({ ...done, brief: undefined })).toBeNull();
  });

  it("shares only the evidence the brief cites", () => {
    const withExtra = { ...done, evidence: { ...done.evidence, ev_77: { id: "ev_77", endpoint: "/x", params: {}, summary: "unused" } } };
    const payload = sharePayloadFromRun(withExtra);
    expect(payload?.evidence.some((e) => e.id === "ev_77")).toBe(false);
    expect(payload?.evidence.length).toBeGreaterThan(0);
  });

  it("falls back to the brief's own city and mode when the request is missing", () => {
    const payload = sharePayloadFromRun({ ...done, request: undefined });
    expect(payload?.city).toBe("Brooklyn");
    expect(payload?.mode).toBe("know_audience");
  });
});

describe("shareLink", () => {
  it("builds /b#<data> that decodes back to the brief", () => {
    const payload = sharePayloadFromRun(done);
    if (!payload) throw new Error("no payload");
    const link = shareLink("https://tasteforge.example", payload);
    expect(link.startsWith("https://tasteforge.example/b#")).toBe(true);
    const res = decodeShare(link.split("#")[1]);
    expect(res.ok).toBe(true);
  });
});
