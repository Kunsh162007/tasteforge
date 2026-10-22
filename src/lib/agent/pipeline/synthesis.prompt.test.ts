import { describe, expect, it } from "vitest";
import { SYNTHESIS_SYSTEM } from "./synthesis";

describe("synthesis instructions", () => {
  it("ask for three short, specific copy lines tied to taste signals", () => {
    expect(SYNTHESIS_SYSTEM).toContain("exactly 3 short copy lines of 4 to 10 words");
    expect(SYNTHESIS_SYSTEM).toContain("never state a fact the evidence lacks");
  });

  it("limit menu ideas to food tags", () => {
    expect(SYNTHESIS_SYSTEM).toContain("Never build a menu idea from music, audience, lifestyle or place-name tags");
    expect(SYNTHESIS_SYSTEM).toContain("no food tags");
  });
});
