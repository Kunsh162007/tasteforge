import { describe, expect, it } from "vitest";
import { areaCandidates, nameAreaFromPlaces, type NearbyPlace } from "./areaNames";

const names = (address: string, city: string): string[] => areaCandidates(address, city).map((c) => c.name);

describe("areaCandidates", () => {
  it("takes the neighbourhood just before the city in an Indian address", () => {
    expect(names("56 Dukan St 11 Bungalow Colony, New Palasia Indore, Madhya Pradesh 452001 India", "Indore")[0]).toBe("New Palasia");
    expect(names("H/1 Maguda Nagar, Vijay Nagar, Scheme No 54 Indore, Madhya Pradesh 452010 India", "Indore")).toContain("Vijay Nagar");
  });

  it("reads the words after the street name when the district sits in the street segment", () => {
    expect(names("Cromwell Rd South Kensington, London SW7 5BD United Kingdom", "London")).toContain("South Kensington");
    expect(names("Bankside London SE1 9TG United Kingdom", "London")).toEqual(["Bankside"]);
  });

  it("finds nothing in an address made of a house number, a street and the city", () => {
    expect(names("620 Atlantic Ave Brooklyn, NY 11217", "Brooklyn")).toEqual([]);
    expect(names("Av. Gustave Eiffel 75007 Paris France", "Paris")).toEqual([]);
    expect(names("London United Kingdom", "London")).toEqual([]);
  });

  it("never offers the city, a street or a plot description as an area", () => {
    const all = names("Plot No. 12, Opp. Railway Crossing, Rau Road Indore, Madhya Pradesh", "Indore");
    expect(all.some((n) => /road|plot|opp|indore/i.test(n))).toBe(false);
  });

  it("drops 'near ...' tails", () => {
    expect(names("14, Manishpuri near Empire House, Saket Nagar Indore, Madhya Pradesh", "Indore")).toContain("Saket Nagar");
    expect(names("14, Manishpuri near Empire House, Saket Nagar Indore, Madhya Pradesh", "Indore").some((n) => /near|empire/i.test(n))).toBe(false);
  });
});

const place = (id: string, lat: number, lon: number, address: string): NearbyPlace => ({ id, lat, lon, address });

describe("nameAreaFromPlaces", () => {
  const cell = { lat: 22.751, lon: 75.889 };
  const vijay = [
    place("a", 22.7512, 75.8895, "H/1 Maguda Nagar, Vijay Nagar, Scheme No 54 Indore, Madhya Pradesh 452010 India"),
    place("b", 22.7527, 75.8837, "H-2 Scheme No 54, Meghdoot Garden Vijay Nagar Indore, Madhya Pradesh 452010 India"),
    place("c", 22.7445, 75.8943, "299A PO, Scheme No.54 Vijay Nagar Indore, Madhya Pradesh 452010 India"),
    place("far", 22.7184, 75.8552, "Rajwada Indore, Madhya Pradesh 452007 India"),
  ];

  it("names a hotspot after the area the places around it share", () => {
    expect(nameAreaFromPlaces(cell, vijay, "Indore")).toBe("Vijay Nagar");
  });

  it("ignores places farther away than the neighbourhood radius", () => {
    expect(nameAreaFromPlaces({ lat: 22.9, lon: 76.2 }, vijay, "Indore")).toBeUndefined();
  });

  it("gives up when no area is named often enough", () => {
    const vague = [place("a", 22.751, 75.889, "620 Atlantic Ave Indore"), place("b", 22.7511, 75.8891, "Av. Gustave Eiffel 75007 Indore")];
    expect(nameAreaFromPlaces(cell, vague, "Indore")).toBeUndefined();
  });

  it("does not reuse a name another hotspot already has", () => {
    expect(nameAreaFromPlaces(cell, vijay, "Indore", new Set(["vijay nagar"]))).not.toBe("Vijay Nagar");
  });
});
