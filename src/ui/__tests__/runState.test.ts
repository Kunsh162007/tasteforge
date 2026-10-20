import { describe, expect, it } from "vitest";
import { stageNote, trailState } from "../runState";

describe("trailState and stageNote", () => {
  it("treats a call the server left out to stay on time as skipped, not failed", () => {
    expect(trailState({ pending: false, ok: false, summary: "Left out: no answer within the time budget." })).toBe("skipped");
    expect(trailState({ pending: false, ok: false, summary: "Qloo answered 500" })).toBe("failed");
    expect(trailState({ pending: false, ok: true, summary: "10 places" })).toBe("ok");
    expect(trailState({ pending: true, ok: true })).toBe("pending");
  });

  it("recognises partial walks and a critic skipped for time", () => {
    expect(stageNote("12 evidence records, partial: 2 calls cut off")).toBe("partial");
    expect(stageNote("skipped, out of time")).toBe("skipped");
    expect(stageNote("coverage looks good")).toBeUndefined();
    expect(stageNote(undefined)).toBeUndefined();
  });
});
