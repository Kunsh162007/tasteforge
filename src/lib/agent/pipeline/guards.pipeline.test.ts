import { describe, expect, it } from "vitest";
import { createQlooClient, type QlooClient, type QlooEntity } from "@/lib/qloo";
import type { AgentEvent } from "../events";
import { draftFromPrompt, routedLlm, type Routes } from "../testing";
import { runPipeline } from "./index";

const mock = createQlooClient({ mode: "mock", baseUrl: "https://hackathon.api.qloo.com" });
const SEEDS = { seeds: [{ name: "Velvet Static", kind: "artist" }], tags: ["indie"], audienceHints: "Dreamy crowd" };
const routes = (over: Routes = {}): Routes => ({ seeds: SEEDS, critic: { followUps: [] }, synthesis: (r) => draftFromPrompt(r.prompt), ...over });

async function run(qloo: QlooClient, r: Routes = routes(), city = "London") {
  const events: AgentEvent[] = [];
  const llm = routedLlm(r, "gemini:test-model");
  const result = await runPipeline({ prompt: "Dream-pop fans", mode: "know_audience", city, llm, qloo, onEvent: (e) => events.push(e) });
  return { result, events };
}

const place = (id: string, name: string, lat: number, lon: number): QlooEntity => ({ id, name, type: "urn:entity:place", affinity: 0.9, location: { latitude: lat, longitude: lon } });
const LONDON = [place("MOCK-PLACE-A", "Cafe A", 51.51, -0.12), place("MOCK-PLACE-B", "Cafe B", 51.52, -0.13), place("MOCK-PLACE-C", "Cafe C", 51.5, -0.1)];
const PARIS = place("MOCK-PLACE-P", "Merci Paris", 48.86, 2.36);

function withPlaces(places: QlooEntity[]): QlooClient {
  return {
    ...mock,
    insights: async (p) => (p.type.endsWith(":place") ? { data: places } : mock.insights(p)),
  };
}

const namesIn = (r: Awaited<ReturnType<typeof run>>["result"]) => r.ledger.records.flatMap((e) => (e.entities ?? []).map((x) => x.name));

describe("seed echo", () => {
  it("keeps the user's seeds out of the evidence and the brief", async () => {
    const { result } = await run(mock);
    expect(result.ok).toBe(true);
    expect(result.ledger.records.filter((r) => r.endpoint === "/v2/insights").flatMap((r) => r.entities ?? []).map((e) => e.id)).not.toContain("MOCK-ARTIST-1");
    expect(result.brief?.sound.artists.map((a) => a.qlooId)).not.toContain("MOCK-ARTIST-1");
  });

  it("removes a seed the writer slipped in from its own knowledge", async () => {
    const { result } = await run(mock, routes({
      synthesis: (req) => {
        const draft = draftFromPrompt(req.prompt) as { sound: { artists: unknown[] } };
        return { ...draft, sound: { ...draft.sound, artists: [{ label: "Velvet Static", evidence: ["ev_1"] }, ...draft.sound.artists] } };
      },
    }));
    expect(result.brief?.sound.artists.map((a) => a.label)).not.toContain("Velvet Static");
  });
});

describe("wrong-city places", () => {
  it("drops places outside the city's cluster before the writer sees them", async () => {
    const { result } = await run(withPlaces([...LONDON, PARIS]));
    expect(namesIn(result)).not.toContain("Merci Paris");
    expect(namesIn(result)).toContain("Cafe A");
    expect(result.brief?.aesthetic.referencePlaces.map((p) => p.label)).not.toContain("Merci Paris");
  });

  it("widens in the same city when the filter leaves the places section thin", async () => {
    let asked = 0;
    const qloo: QlooClient = {
      ...mock,
      insights: async (p) => {
        if (!p.type.endsWith(":place")) return mock.insights(p);
        asked += 1;
        return { data: p.take && p.take >= 20 ? [...LONDON, place("MOCK-PLACE-D", "Cafe D", 51.53, -0.14)] : [PARIS, LONDON[0], LONDON[1], { ...PARIS, id: "MOCK-PLACE-Q", name: "Paris Two" }] };
      },
    };
    const { result, events } = await run(qloo);
    expect(asked).toBeGreaterThan(1);
    expect(namesIn(result)).toEqual(expect.arrayContaining(["Cafe D"]));
    expect(namesIn(result)).not.toContain("Merci Paris");
    const widened = events.filter((e) => e.type === "tool_call" && e.name === "qloo_insights" && e.args.type === "place" && e.args.take === 20);
    expect(widened.length).toBeGreaterThan(0);
  });
});

describe("brief metadata", () => {
  it("records which model answered", async () => {
    const { result } = await run(mock);
    expect(result.brief?.model).toBe("gemini:test-model");
  });
});

describe("style and menu evidence", () => {
  const decor = (n: string) => ({ id: `urn:tag:decor:qloo:${n.toLowerCase()}`, name: n });
  const dish = (name: string, weight: number) => ({ id: `urn:tag:specialty_dish:place:${name.toLowerCase().replace(/\W+/g, "_")}`, type: "urn:tag:specialty_dish:place", name, weight });
  const styled = (id: string, name: string, lat: number, tags: ReturnType<typeof decor>[], dishes: ReturnType<typeof dish>[]): QlooEntity => ({
    id, name, type: "urn:entity:place", affinity: 0.9, location: { latitude: lat, longitude: -0.12 }, tags, properties: { specialty_dishes: dishes },
  });
  const top = [
    styled("MOCK-PLACE-A", "Cafe A", 51.51, [decor("Rustic"), decor("Handcrafted"), decor("Vintage"), decor("Stylish")], [dish("Bun Maska", 1), dish("White", 1)]),
    styled("MOCK-PLACE-B", "Cafe B", 51.52, [decor("Rustic"), decor("Handcrafted"), decor("Vintage"), decor("Stylish")], [dish("Bun Maska", 0.9), dish("Chai", 0.7)]),
    styled("MOCK-PLACE-C", "Cafe C", 51.5, [decor("Rustic"), decor("Handcrafted"), decor("Vintage"), decor("Stylish")], [dish("Filter Coffee", 0.8)]),
  ];
  // Everyone in the city is "Stylish"; only these cafes are "Rustic".
  const everyday = [1, 2, 3, 4].map((n) => styled(`B${n}`, `Shop ${n}`, 51.5 + n / 100, [decor("Stylish")], []));
  const qloo: QlooClient = {
    ...mock,
    insights: async (p) => (p.type.endsWith(":place") ? { data: p.entities?.length || p.tags?.length ? top : everyday } : mock.insights(p)),
    entityTags: async (p) =>
      p.tagTypes?.some((t) => t.includes("decor"))
        ? { data: [{ id: decor("Stylish").id, name: "Stylish", score: 0.99 }, { id: decor("Rustic").id, name: "Rustic", score: 0.8 }] }
        : { data: [] },
  };

  it("ranks decor tags by how specific they are to the top places", async () => {
    const { result } = await run(qloo);
    const style = result.ledger.records.find((r) => r.endpoint.includes("urn:tag") && r.params.tag_types?.includes("decor"));
    expect(style?.tags?.map((t) => t.name)[0]).toBe("Rustic");
    expect(style?.tags?.map((t) => t.name)).not.toContain("Stylish");
  });

  it("fills the pairings from the places' own signature dishes when Qloo's tag pool is empty", async () => {
    const { result } = await run(qloo);
    const menu = result.ledger.records.find((r) => r.endpoint.includes("urn:tag") && r.params.tag_types?.includes("cuisine"));
    expect(menu?.tags?.map((t) => t.name)).toEqual(expect.arrayContaining(["Bun Maska", "Filter Coffee"]));
    expect(menu?.tags?.map((t) => t.name)).not.toContain("White");
    expect(menu?.summary).toMatch(/^\d+ tags; top: Bun Maska/);
  });
});
