import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createQlooClient } from "../client";
import { QlooError } from "../errors";
import { createMockFetch } from "../mock";
import { DEMO_CITIES, formatReport, linkVerifyItems, runChecks, scanVerifyItems, summarize, type CheckContext, type Probe } from "./index";

const BASE = "https://hackathon.api.qloo.com";
const mockFetch = createMockFetch();
const mockProbe: Probe = async (path) => {
  const res = await mockFetch(`${BASE}${path}`);
  return { status: res.status, body: await res.json().catch(() => undefined) };
};
const client = createQlooClient({ mode: "mock", baseUrl: BASE });
const ctx = (over: Partial<CheckContext> = {}): CheckContext => ({ client, probe: mockProbe, mode: "mock", cities: DEMO_CITIES, now: new Date("2026-10-18T00:00:00Z"), ...over });
const byId = (rs: Awaited<ReturnType<typeof runChecks>>, id: string) => rs.find((r) => r.id === id);

describe("runChecks against mock data", () => {
  it("covers every P4 risk check and the VERIFY items, with no failures", async () => {
    const rs = await runChecks(ctx());
    const ids = rs.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(["auth", "search.film", "search.artist", "insights.results_entities", "demographics", "trending", "types.destination", "types.video_game", "tags.search_param"]));
    for (const city of DEMO_CITIES) {
      expect(ids).toEqual(expect.arrayContaining([`places.film.${city}`, `places.artist.${city}`, `tags.decor_ambience.${city}`, `heatmap.cells.${city}`]));
    }
    expect(rs.filter((r) => r.status === "FAIL")).toEqual([]);
    expect(byId(rs, "heatmap.cells.London")?.status).toBe("PASS");
  });

  it("explains every non-passing check with a fix", async () => {
    const rs = await runChecks(ctx());
    for (const r of rs.filter((x) => x.status === "FAIL" || x.status === "WARN")) expect(r.fix).toBeTruthy();
  });
});

describe("runChecks failure handling", () => {
  it("reports one clear auth failure and skips the rest when the key is rejected", async () => {
    const denied = { ...client, search: () => Promise.reject(new QlooError("auth", "Qloo rejected the API key (401).", 401)) };
    const rs = await runChecks(ctx({ client: denied }));
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ id: "auth", status: "FAIL" });
    expect(rs[0].fix).toMatch(/QLOO_API_KEY/);
  });

  it("flags a rejected entity type spelling and recommends the accepted one", async () => {
    const probe: Probe = async (path) => {
      if (path.includes("urn%3Aentity%3Avideogame") || path.includes("urn:entity:videogame")) return { status: 400, body: undefined };
      return mockProbe(path);
    };
    const mockWithVideoGame: Probe = async (path) => (path.includes("video_game") ? { status: 200, body: {} } : probe(path));
    const rs = await runChecks(ctx({ probe: mockWithVideoGame }));
    const check = byId(rs, "types.video_game");
    expect(check?.status).toBe("FAIL");
    expect(check?.fix).toContain("urn:entity:video_game");
  });

  it("fails the tag param check when the text parameter is silently ignored", async () => {
    const sameForAll: Probe = async (path) => (path.startsWith("/v2/tags") ? { status: 200, body: { results: { tags: [{ tag_id: "t1", name: "Same" }] } } } : mockProbe(path));
    const rs = await runChecks(ctx({ probe: sameForAll }));
    expect(byId(rs, "tags.search_param")?.status).toBe("FAIL");
    expect(byId(rs, "tags.search_param")?.detail).toMatch(/ignored/);
  });

  it("passes bare heatmap cells (the live shape) and says the geocoder names them", async () => {
    const unnamed = { ...client, heatmap: async () => ({ data: [{ geohash: "abc", latitude: 1, longitude: 2, affinity: 0.5 }] }) };
    const rs = await runChecks(ctx({ client: unnamed, cities: ["London"] }));
    const heat = byId(rs, "heatmap.cells.London");
    expect(heat?.status).toBe("PASS");
    expect(heat?.detail).toMatch(/geocoder/);
  });

  it("fails places for a city without results and points to the fallback", async () => {
    const rs = await runChecks(ctx({ cities: ["Atlantis"] }));
    const places = byId(rs, "places.artist.Atlantis");
    expect(places?.status).toBe("FAIL");
    expect(places?.fix).toMatch(/Brooklyn/);
  });
});

describe("verify items", () => {
  it("finds markers in this repo's source and links each to a check", () => {
    const items = scanVerifyItems(join(process.cwd(), "src"), process.cwd());
    // Every marker was settled against the live API on 2026-10-20 and reworded to "verified live"; new ones link up.
    expect(items.every((i) => i.file.startsWith("src/") && !i.file.includes("\\"))).toBe(true);
    const rows = linkVerifyItems(items, []);
    expect(rows.filter((r) => r.checks === "(no check yet)")).toEqual([]);
  });

  it("flags a marker nobody checks", () => {
    const dir = mkdtempSync(join(tmpdir(), "verify-"));
    try {
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "src", "x.ts"), "// VERIFY with live key: something brand new\n");
      const rows = linkVerifyItems(scanVerifyItems(join(dir, "src"), dir), []);
      expect(rows[0]).toMatchObject({ checks: "(no check yet)", status: "WARN" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("formatReport", () => {
  it("prints the table, fixes and summary without ANSI codes by default", async () => {
    const rs = await runChecks(ctx({ cities: ["Atlantis"] }));
    const text = formatReport(rs, linkVerifyItems(scanVerifyItems(join(process.cwd(), "src"), process.cwd()), rs));
    expect(text).toContain("RECOMMENDED FIXES");
    expect(text).toContain("SUMMARY:");
    expect(text).not.toContain("\u001b[");
    expect(summarize(rs).FAIL).toBeGreaterThan(0);
  });
});
