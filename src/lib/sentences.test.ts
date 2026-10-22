import { describe, expect, it } from "vitest";
import { asSentence, joinSentences, tidyNote } from "./sentences";

describe("sentences", () => {
  it("closes and capitalises a fragment", () => {
    expect(asSentence("  natural wine ")).toBe("Natural wine.");
    expect(asSentence("Already done!")).toBe("Already done!");
  });

  it("joins notes as sentences", () => {
    expect(joinSentences("Natural Wine", "Creative suggestion from Qloo tags: Jazz.")).toBe("Natural Wine. Creative suggestion from Qloo tags: Jazz.");
  });

  it("repairs a note saved without punctuation", () => {
    expect(tidyNote("Natural Wine Creative suggestion from Qloo tags: Jazz.")).toBe("Natural Wine. Creative suggestion from Qloo tags: Jazz.");
  });
});
