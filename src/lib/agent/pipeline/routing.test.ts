import { describe, expect, it } from "vitest";
import { signalArgsFor, tagsFor } from "./routing";

const MUSIC = "urn:tag:genre:music:ambient";
const MOOD = "urn:tag:ambience:qloo:slow_living";

describe("film and TV signals", () => {
  it("leave music-genre tags out when other tags exist", () => {
    expect(tagsFor("movie", { entityIds: [], tagIds: [MUSIC, MOOD] })).toEqual([MOOD]);
    expect(tagsFor("tv_show", { entityIds: ["E1"], tagIds: [MUSIC, MOOD] })).toEqual([MOOD]);
  });

  it("stay on the seed entities when only music tags remain", () => {
    expect(signalArgsFor("movie", { entityIds: ["E1"], tagIds: [MUSIC] })).toEqual({ entity_ids: ["E1"] });
  });

  it("fall back to the music tags when there is nothing else to go on", () => {
    expect(tagsFor("movie", { entityIds: [], tagIds: [MUSIC] })).toEqual([MUSIC]);
  });
});
