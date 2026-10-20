import { describe, expect, it } from "vitest";
import type { QlooEntity, QlooTag } from "@/lib/qloo";
import { baselineShares, menuTags, rankStyleTags, rememberPlaces, type PlaceFacts } from "./placeFacts";

const tag = (id: string, name: string): QlooTag => ({ id, name });
const decor = (n: string): QlooTag => tag(`urn:tag:decor:qloo:${n.toLowerCase()}`, n);
const ambience = (n: string): QlooTag => tag(`urn:tag:ambience:qloo:${n.toLowerCase()}`, n);

function place(id: string, tags: QlooTag[], dishes: { name: string; weight: number }[] = []): QlooEntity {
  return { id, name: id, type: "urn:entity:place", tags, properties: { specialty_dishes: dishes.map((d) => ({ id: `urn:tag:specialty_dish:place:${d.name.toLowerCase().replace(/\W+/g, "_")}`, type: "urn:tag:specialty_dish:place", ...d })) } };
}

describe("rememberPlaces", () => {
  it("keeps tags and dishes of place entities only", () => {
    const facts = new Map<string, PlaceFacts>();
    rememberPlaces(facts, [place("p1", [decor("Rustic")], [{ name: "Bun Maska", weight: 1 }]), { id: "a1", name: "Band", type: "urn:entity:artist", tags: [decor("x")] }]);
    expect([...facts.keys()]).toEqual(["p1"]);
    expect(facts.get("p1")?.dishes).toEqual([{ id: "urn:tag:specialty_dish:place:bun_maska", name: "Bun Maska", weight: 1 }]);
  });
});

describe("rankStyleTags", () => {
  const facts = new Map<string, PlaceFacts>();
  rememberPlaces(facts, [
    place("p1", [decor("Rustic"), decor("Stylish"), ambience("Relaxed")]),
    place("p2", [decor("Rustic"), decor("Stylish"), decor("Handcrafted")]),
    place("p3", [decor("Rustic"), decor("Stylish"), decor("Handcrafted"), ambience("Relaxed")]),
    place("p4", [decor("Stylish"), decor("Unique")]),
  ]);
  const baseline = baselineShares([
    place("b1", [decor("Stylish"), ambience("Relaxed")]),
    place("b2", [decor("Stylish")]),
    place("b3", [decor("Stylish"), decor("Modern")]),
    place("b4", [decor("Modern")]),
  ]);

  it("prefers tags shared by several top places that are rare in the city baseline", () => {
    const ranked = rankStyleTags(["p1", "p2", "p3", "p4"], facts, baseline);
    const names = ranked.map((t) => t.name);
    expect(names.slice(0, 2)).toEqual(["Rustic", "Handcrafted"]);
    expect(names).not.toContain("Stylish");
    expect(names).not.toContain("Unique");
  });

  it("returns nothing without facts for the places", () => {
    expect(rankStyleTags(["zz"], facts, baseline)).toEqual([]);
  });
});

describe("menuTags", () => {
  it("lists dishes by combined weight across places and tidies Qloo artefacts", () => {
    const facts = new Map<string, PlaceFacts>();
    rememberPlaces(facts, [
      place("p1", [], [{ name: "Tea Extra Kulhad", weight: 1 }, { name: "And Sandwiches", weight: 0.9 }, { name: "White", weight: 1 }]),
      place("p2", [tag("urn:tag:cuisine:qloo:indian", "Indian")], [{ name: "Sandwiches", weight: 0.8 }, { name: "Bun Maska", weight: 0.7 }]),
    ]);
    const names = menuTags(["p1", "p2"], facts).map((t) => t.name);
    expect(names[0]).toBe("Sandwiches");
    expect(names).toContain("Tea Extra Kulhad");
    expect(names).toContain("Indian");
    expect(names).not.toContain("White");
    expect(names.filter((n) => /sandwich/i.test(n))).toHaveLength(1);
  });
});
