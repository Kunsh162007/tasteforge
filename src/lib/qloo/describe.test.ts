import { describe, expect, it } from "vitest";
import { entityImage, entityNote } from "./describe";

describe("entityNote", () => {
  it("summarises a place with address, price, rating and description", () => {
    const note = entityNote("urn:entity:place", {
      address: "1 Fake Street Testville",
      price_level: 3,
      business_rating: 4.26,
      short_description: "A synthetic cafe. It has a second sentence.",
    });
    expect(note).toBe("1 Fake Street Testville | $$$ 4.3/5 | A synthetic cafe.");
  });

  it("summarises a brand with positioning, style and price range", () => {
    const note = entityNote("urn:entity:brand", {
      short_description: "A fake outdoor label.",
      personal_style: ["Minimalist", "Technical"],
      price_range_usd_min: 30,
      price_range_usd_max: 800,
    });
    expect(note).toBe("A fake outdoor label. | Minimalist, Technical | USD 30-800");
  });

  it("summarises artists and screen titles", () => {
    expect(entityNote("urn:entity:artist", { short_description: "A fake band.", primary_genres: ["Indie Rock"], adjectives_for_music: ["Warm"] })).toBe(
      "A fake band. | Indie Rock | Warm",
    );
    expect(entityNote("urn:entity:movie", { genres: ["Drama"], release_year: 2020, style_description: "Slow, quiet shots." })).toBe("Drama 2020 | Slow, quiet shots.");
  });

  it("stays short and returns nothing when there are no usable fields", () => {
    expect(entityNote("urn:entity:place", { short_description: "x".repeat(400) })?.length).toBeLessThanOrEqual(120);
    expect(entityNote("urn:entity:place", {})).toBeUndefined();
    expect(entityNote("urn:entity:place", undefined)).toBeUndefined();
  });
});

describe("entityImage", () => {
  it("reads properties.image.url or the first of properties.images", () => {
    expect(entityImage({ image: { url: "https://img.test/a.jpg" } })).toBe("https://img.test/a.jpg");
    expect(entityImage({ images: [{ url: "https://img.test/b.jpg" }] })).toBe("https://img.test/b.jpg");
    expect(entityImage({})).toBeUndefined();
  });
});
