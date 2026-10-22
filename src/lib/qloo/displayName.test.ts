import { describe, expect, it } from "vitest";
import { displayName, fixPossessive, nameFromId } from "./displayName";
import { normalizeEntity, normalizeTag } from "./normalize";

describe("fixPossessive", () => {
  it("restores the apostrophe Qloo's name lost", () => {
    expect(fixPossessive("Buddy S Burger")).toBe("Buddy's Burger");
    expect(fixPossessive("Joe S")).toBe("Joe's");
  });

  it("leaves ordinary names alone", () => {
    expect(fixPossessive("Vitamin C")).toBe("Vitamin C");
    expect(fixPossessive("Soul Food")).toBe("Soul Food");
    expect(fixPossessive("A S")).toBe("A S");
  });
});

describe("nameFromId", () => {
  it("never turns a slug into 'Buddy S'", () => {
    expect(nameFromId("urn:tag:specialty_dish:place:buddy_s_burger")).toBe("Buddy's Burger");
  });
  it("keeps an id that has no slug", () => {
    expect(nameFromId("E1")).toBe("E1");
  });
});

describe("displayName", () => {
  it("prefers Qloo's display name over the slug", () => {
    expect(displayName("Smoked Brisket", "urn:tag:x:something_else")).toBe("Smoked Brisket");
    expect(displayName(undefined, "urn:tag:x:slow_burn")).toBe("Slow Burn");
  });
});

describe("normalizers", () => {
  it("clean tag and entity names", () => {
    expect(normalizeTag({ tag_id: "urn:tag:x:buddy_s_burger", name: "Buddy S Burger" })?.name).toBe("Buddy's Burger");
    expect(normalizeEntity({ entity_id: "E1", name: "Buddy S Burger" })?.name).toBe("Buddy's Burger");
    expect(normalizeTag({ tag_id: "urn:tag:x:buddy_s_burger" })?.name).toBe("Buddy's Burger");
  });
});
