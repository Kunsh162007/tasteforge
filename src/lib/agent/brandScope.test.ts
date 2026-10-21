import { describe, expect, it } from "vitest";
import { brandScopeFor, consumerBrands, impliesMedia, nonConsumerReason } from "./brandScope";

const brand = (...tags: string[]) => ({ tags: tags.map((name) => ({ id: name, name })) });

describe("nonConsumerReason", () => {
  it("names the tag that marks a brand as media, an agency, a school, an NGO or an app", () => {
    expect(nonConsumerReason(brand("Mass media companies established in 1995", "Photo agencies"))).toBe("Mass media companies established in 1995");
    expect(nonConsumerReason(brand("News & Politics"))).toBe("News & Politics");
    expect(nonConsumerReason(brand("Academic"))).toBe("Academic");
    expect(nonConsumerReason(brand("Advocacy NGO"))).toBe("Advocacy NGO");
    expect(nonConsumerReason(brand("Mobile App"))).toBe("Mobile App");
    expect(nonConsumerReason(brand("Lifestyle websites"))).toBe("Lifestyle websites");
  });

  it("leaves cafes, fashion and shops alone", () => {
    expect(nonConsumerReason(brand("Food & Beverage", "Coffee & Tea", "Minimalist"))).toBeUndefined();
    expect(nonConsumerReason(brand("Fashion", "Social enterprises"))).toBeUndefined();
    expect(nonConsumerReason({})).toBeUndefined();
  });
});

describe("consumerBrands and scope", () => {
  const all = [brand("Photo agencies"), brand("Coffee & Tea"), {}];
  it("filters in consumer scope and keeps everything in 'any' scope", () => {
    expect(consumerBrands(all, "consumer")).toHaveLength(2);
    expect(consumerBrands(all, "any")).toHaveLength(3);
  });

  it("keeps media brands when the request is about media, film, publishing or teaching", () => {
    expect(brandScopeFor("A cafe for young professionals who love indie music")).toBe("consumer");
    expect(brandScopeFor("A wine bar in New York for people who love A24 films")).toBe("consumer");
    expect(brandScopeFor("A pop-up bakery for locals who love ceramics and film photography")).toBe("consumer");
    expect(impliesMedia("An independent magazine and print studio")).toBe(true);
    expect(impliesMedia("A pottery studio running weekend classes")).toBe(true);
    expect(impliesMedia("A coffee roaster and independent record label")).toBe(true);
    expect(impliesMedia("A natural-wine bar with a plant-filled room")).toBe(false);
  });
});
