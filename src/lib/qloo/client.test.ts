import { describe, expect, it, vi } from "vitest";
import { createQlooClient } from "./client";
import { QlooError } from "./errors";
import { ENTITY_TYPES } from "./types";

const BASE = "https://hackathon.api.qloo.com";
const KEY = "TEST-KEY-123";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const noSleep = async (): Promise<void> => undefined;

function makeClient(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
    handler(String(url), init ?? {}),
  );
  const client = createQlooClient({
    apiKey: KEY,
    baseUrl: BASE,
    mode: "live",
    fetchImpl: fetchImpl as unknown as typeof fetch,
    timeoutMs: 200,
    retry: { sleep: noSleep, random: () => 0.5 },
  });
  return { client, fetchImpl };
}

const entityBody = {
  success: true,
  results: {
    entities: [
      {
        entity_id: "E1",
        name: "Cafe Lumen",
        subtype: "urn:entity:place",
        popularity: 0.8,
        query: { affinity: 0.91 },
        tags: [
          { id: "urn:tag:decor:qloo:industrial", name: "Industrial", type: "urn:tag:decor:qloo" },
        ],
        properties: { description: "Fake cafe", akas: [{ value: "x" }] },
        location: { lat: 40.7, lon: -73.9 },
      },
      { name: "No id entity" },
    ],
  },
};

describe("request construction", () => {
  it("sends GET with X-Api-Key and the built URL", async () => {
    const { client, fetchImpl } = makeClient(() => jsonResponse(entityBody));
    await client.insights({ type: ENTITY_TYPES.place, tags: ["urn:tag:x"], locationQuery: "Brooklyn" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      `${BASE}/v2/insights?filter.type=urn:entity:place&signal.interests.tags=urn:tag:x&filter.location.query=Brooklyn`,
    );
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe(KEY);
    expect(init.body).toBeUndefined();
  });

  it("requires an API key in live mode", () => {
    expect(() => createQlooClient({ baseUrl: BASE, mode: "live" })).toThrow(/QLOO_API_KEY/);
  });
});

describe("normalization", () => {
  it("normalizes entities, drops akas, tolerates missing fields", async () => {
    const { client } = makeClient(() => jsonResponse(entityBody));
    const res = await client.insights({ type: ENTITY_TYPES.place, tags: ["t"] });
    expect(res.warning).toBeUndefined();
    expect(res.data).toHaveLength(1); // entity without an id is dropped
    expect(res.data[0]).toEqual({
      id: "E1",
      name: "Cafe Lumen",
      type: "urn:entity:place",
      affinity: 0.91,
      popularity: 0.8,
      tags: [
        { id: "urn:tag:decor:qloo:industrial", name: "Industrial", type: "urn:tag:decor:qloo" },
      ],
      location: { latitude: 40.7, longitude: -73.9 },
      note: "Fake cafe",
      properties: { description: "Fake cafe" },
    });
  });

  it("reads search results from a bare array or results.entities", async () => {
    const e = { entity_id: "S1", name: "Velvet Static (band)", subtype: "urn:entity:artist" };
    const a = makeClient(() => jsonResponse({ results: [e] }));
    const b = makeClient(() => jsonResponse({ results: { entities: [e] } }));
    expect((await a.client.search({ query: "velvet" })).data[0]?.id).toBe("S1");
    expect((await b.client.search({ query: "velvet" })).data[0]?.id).toBe("S1");
  });

  it("normalizes tags from several id spellings", async () => {
    const { client } = makeClient(() =>
      jsonResponse({
        results: {
          tags: [
            { tag_id: "urn:tag:a", name: "A", subtype: "urn:tag:genre", query: { affinity: 0.4 } },
            { id: "urn:tag:b", name: "B", type: "urn:tag:t" },
            { tag_value: "urn:tag:c", name: "C" },
            { name: "no id" },
          ],
        },
      }),
    );
    const res = await client.findTags({ query: "x" });
    expect(res.data.map((t) => t.id)).toEqual(["urn:tag:a", "urn:tag:b", "urn:tag:c"]);
    expect(res.data[0]).toEqual({ id: "urn:tag:a", name: "A", type: "urn:tag:genre", score: 0.4 });
  });

  it("normalizes entityTags, demographics, heatmap and trending", async () => {
    const { client } = makeClient((url) => {
      if (url.includes("urn:demographics")) {
        return jsonResponse({
          results: {
            demographics: [
              { entity_id: "E1", query: { age: { "25_to_29": 0.4 }, gender: { male: 0.1 } } },
              { query: {} },
            ],
          },
        });
      }
      if (url.includes("urn:heatmap")) {
        return jsonResponse({
          results: {
            heatmap: [
              {
                location: { latitude: 1, longitude: 2, geohash: "dr5wct" },
                query: { affinity: 0.9, affinity_rank: 0.8, popularity: 0.7 },
              },
              { location: { latitude: 1 } },
            ],
          },
        });
      }
      if (url.includes("/v2/trending")) {
        return jsonResponse({
          results: {
            trending: [
              {
                date: "2026-10-01",
                population_percentile: 85.2,
                population_rank: 150,
                population_rank_velocity: 5,
                velocity_fold_change: 1.1,
                population_percent_delta: 0.3,
              },
              { population_rank: 3 },
            ],
          },
        });
      }
      return jsonResponse({
        results: { tags: [{ tag_id: "urn:tag:decor:qloo:cozy", name: "Cozy" }] },
      });
    });

    expect((await client.entityTags({ entities: ["E1"] })).data[0]?.name).toBe("Cozy");
    expect((await client.demographics({ entities: ["E1"] })).data).toEqual([
      { entityId: "E1", age: { "25_to_29": 0.4 }, gender: { male: 0.1 } },
    ]);
    expect((await client.heatmap({ locationQuery: "NYC", tags: ["t"] })).data).toEqual([
      { geohash: "dr5wct", latitude: 1, longitude: 2, affinity: 0.9, affinityRank: 0.8, popularity: 0.7 },
    ]);
    const trend = await client.trending({
      type: ENTITY_TYPES.artist,
      entities: ["E1"],
      startDate: "2026-09-01",
      endDate: "2026-10-01",
    });
    expect(trend.data).toHaveLength(1);
    expect(trend.data[0]).toMatchObject({
      date: "2026-10-01",
      populationPercentile: 85.2,
      populationRank: 150,
      rankVelocity: 5,
      velocityFoldChange: 1.1,
      percentDelta: 0.3,
    });
  });
});

describe("empty results", () => {
  it("returns an empty list with a warning on 200 + no results", async () => {
    const { client } = makeClient(() => jsonResponse({ success: true, results: { entities: [] } }));
    const res = await client.insights({ type: ENTITY_TYPES.place, tags: ["t"], locationQuery: "Nowhere" });
    expect(res.data).toEqual([]);
    expect(res.warning).toMatch(/no results/i);
    expect(res.warning).toMatch(/filter\.type/);
  });

  it("treats a missing results object as empty", async () => {
    const { client } = makeClient(() => jsonResponse({ success: true }));
    const res = await client.search({ query: "x" });
    expect(res.data).toEqual([]);
    expect(res.warning).toBeDefined();
  });
});

describe("error mapping", () => {
  const cases: [number, string, RegExp][] = [
    [401, "auth", /base URL|API key/],
    [403, "unsupported_type", /not supported/],
    [429, "rate_limit", /rate limit/i],
    [400, "bad_request", /rejected/],
    [500, "http", /500/],
  ];

  it.each(cases)("maps HTTP %i to %s", async (status, kind, message) => {
    const { client } = makeClient(() => jsonResponse({ message: "nope" }, status));
    const err = await client.search({ query: "x" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QlooError);
    expect((err as QlooError).kind).toBe(kind);
    expect((err as QlooError).status).toBe(status);
    expect((err as QlooError).message).toMatch(message);
    expect((err as QlooError).message).not.toContain(KEY);
  });

  it("maps invalid JSON to invalid_response", async () => {
    const { client } = makeClient(() => new Response("<html>", { status: 200 }));
    const err = await client.search({ query: "x" }).catch((e: unknown) => e);
    expect((err as QlooError).kind).toBe("invalid_response");
  });

  it("maps a network failure to network without leaking the key", async () => {
    const { client } = makeClient(() => {
      throw new TypeError(`fetch failed for ${KEY}`);
    });
    const err = (await client.search({ query: "x" }).catch((e: unknown) => e)) as QlooError;
    expect(err.kind).toBe("network");
    expect(err.message).not.toContain(KEY);
  });

  it("aborts slow requests with a timeout error", async () => {
    const { client } = makeClient(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const err = (await client.search({ query: "x" }).catch((e: unknown) => e)) as QlooError;
    expect(err.kind).toBe("timeout");
  });
});

describe("retry", () => {
  it.each([[429], [500], [503]])("retries once after HTTP %i and returns the second answer", async (status) => {
    const sleeps: number[] = [];
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? jsonResponse({}, status) : jsonResponse(entityBody);
    });
    const client = createQlooClient({
      apiKey: KEY,
      baseUrl: BASE,
      mode: "live",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      retry: { sleep: async (ms) => void sleeps.push(ms), random: () => 0.5, baseDelayMs: 400 },
    });
    const res = await client.search({ query: "x" });
    expect(res.data).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([400]);
  });

  it("jitters the delay between half and one-and-a-half times the base", async () => {
    const delays: number[] = [];
    for (const random of [0, 0.999]) {
      let calls = 0;
      const client = createQlooClient({
        apiKey: KEY,
        baseUrl: BASE,
        mode: "live",
        fetchImpl: (async () => (++calls === 1 ? jsonResponse({}, 429) : jsonResponse(entityBody))) as unknown as typeof fetch,
        retry: { sleep: async (ms) => void delays.push(ms), random: () => random, baseDelayMs: 400 },
      });
      await client.search({ query: "x" });
    }
    expect(delays[0]).toBe(200);
    expect(delays[1]).toBeGreaterThan(599);
    expect(delays[1]).toBeLessThan(601);
  });

  it("does not retry a timeout (the slow queries are slow every time)", async () => {
    const hang = (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    const fetchImpl = vi.fn(hang);
    const client = createQlooClient({
      apiKey: KEY,
      baseUrl: BASE,
      mode: "live",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 20,
      retry: { sleep: noSleep },
    });
    const err = (await client.search({ query: "x" }).catch((e: unknown) => e)) as QlooError;
    expect(err.kind).toBe("timeout");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives a rate limit two more attempts", async () => {
    let calls = 0;
    const { client } = makeClient(() => (++calls < 3 ? jsonResponse({}, 429) : jsonResponse(entityBody)));
    expect((await client.search({ query: "x" })).data).toHaveLength(1);
    expect(calls).toBe(3);
  });

  it("does not retry client errors, and stops after one retry", async () => {
    const bad = makeClient(() => jsonResponse({}, 400));
    await expect(bad.client.search({ query: "x" })).rejects.toMatchObject({ kind: "bad_request" });
    expect(bad.fetchImpl).toHaveBeenCalledTimes(1);
    const down = makeClient(() => jsonResponse({}, 503));
    await expect(down.client.search({ query: "x" })).rejects.toMatchObject({ kind: "http", status: 503 });
    expect(down.fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("caching", () => {
  it("serves repeat requests from cache and does not cache errors", async () => {
    let calls = 0;
    const { client, fetchImpl } = makeClient(() => {
      calls += 1;
      return calls === 1 ? jsonResponse({}, 400) : jsonResponse(entityBody);
    });
    await expect(client.search({ query: "x" })).rejects.toBeInstanceOf(QlooError);
    const first = await client.search({ query: "x" });
    const second = await client.search({ query: "x" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(second).toEqual(first);
  });

  it("can be disabled", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(entityBody));
    const client = createQlooClient({
      apiKey: KEY,
      baseUrl: BASE,
      mode: "live",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cache: false,
    });
    await client.search({ query: "x" });
    await client.search({ query: "x" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("request limiter", () => {
  it("keeps at most maxConcurrent requests in flight and spaces their starts", async () => {
    let active = 0;
    let peak = 0;
    const starts: number[] = [];
    const fetchImpl = vi.fn(async () => {
      starts.push(Date.now());
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 20));
      active -= 1;
      return jsonResponse(entityBody);
    });
    const client = createQlooClient({
      apiKey: KEY,
      baseUrl: BASE,
      mode: "live",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cache: false,
      maxConcurrent: 2,
      minGapMs: 15,
    });
    await Promise.all(["a", "b", "c", "d", "e"].map((q) => client.search({ query: q })));
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(peak).toBeLessThanOrEqual(2);
    // Timers can fire late and bunch up, so check the whole spread rather than every single gap.
    expect(starts[starts.length - 1] - starts[0]).toBeGreaterThanOrEqual(4 * 15 * 0.7);
  });
});

describe("hedged requests and shared answers", () => {
  function hangingFetch(init?: RequestInit): Promise<Response> {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  }

  function hedgedClient(handler: (call: number, init: RequestInit) => Promise<Response>) {
    let calls = 0;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => handler(++calls, init ?? {}));
    const client = createQlooClient({
      apiKey: KEY,
      baseUrl: BASE,
      mode: "live",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 300,
      hedgeAfterMs: 20,
      retry: { sleep: noSleep },
    });
    return { client, fetchImpl };
  }

  it("sends one duplicate when the first request is slow and takes the first answer", async () => {
    const { client, fetchImpl } = hedgedClient((call, init) => (call === 1 ? hangingFetch(init) : Promise.resolve(jsonResponse(entityBody))));
    const started = Date.now();
    expect((await client.search({ query: "x" })).data).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(Date.now() - started).toBeLessThan(250);
  });

  it("does not send a duplicate when the first request answers in time", async () => {
    const { client, fetchImpl } = hedgedClient(async () => jsonResponse(entityBody));
    await client.search({ query: "x" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails only when both the request and its duplicate fail", async () => {
    const { client, fetchImpl } = hedgedClient((_call, init) => hangingFetch(init));
    const err = (await client.search({ query: "x" }).catch((e: unknown) => e)) as QlooError;
    expect(err.kind).toBe("timeout");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("answers identical in-flight requests with one HTTP call", async () => {
    const { client, fetchImpl } = hedgedClient(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return jsonResponse(entityBody);
    });
    const [a, b] = await Promise.all([client.search({ query: "same" }), client.search({ query: "same" })]);
    expect(a.data).toEqual(b.data);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("cache lifetime", () => {
  it("keeps name searches for a day and insights for the default hour", async () => {
    let now = 0;
    const { createCache } = await import("./cache");
    const cache = createCache<unknown>({ maxEntries: 10, ttlMs: 1000, now: () => now });
    const fetchImpl = vi.fn(async () => jsonResponse(entityBody));
    const client = createQlooClient({ apiKey: KEY, baseUrl: BASE, mode: "live", fetchImpl: fetchImpl as unknown as typeof fetch, cache, retry: { sleep: noSleep } });
    await client.search({ query: "x" });
    await client.insights({ type: ENTITY_TYPES.place, locationQuery: "Brooklyn" });
    now = 5_000;
    await client.search({ query: "x" });
    await client.insights({ type: ENTITY_TYPES.place, locationQuery: "Brooklyn" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
