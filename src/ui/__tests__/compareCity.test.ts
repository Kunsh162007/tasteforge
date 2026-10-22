import { describe, expect, it } from "vitest";
import { isSameCity, suggestSecondCity } from "../compareCity";

describe("suggestSecondCity", () => {
  it("suggests a different city from the brief's own", () => {
    expect(suggestSecondCity("Chicago")).toBe("London");
    expect(suggestSecondCity("London")).toBe("New York");
    expect(suggestSecondCity("  london, UK ")).toBe("New York");
  });

  it("never returns the brief's city, whatever it is", () => {
    for (const c of ["London", "New York", "Chicago", "Los Angeles", "Berlin", "Tokyo", "Indore", ""]) {
      expect(isSameCity(suggestSecondCity(c), c)).toBe(false);
    }
  });
});
