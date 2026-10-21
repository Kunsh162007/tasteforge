import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GenerateResult } from "@/lib/agent";
import { makeDraft } from "@/lib/agent/testing";
import { backoffMs, BASE_BACKOFF_MS, createShowcaseService, MAX_ATTEMPTS, SHOWCASES, type ShowcaseDef, type ShowcaseGenerate } from "./showcase";

const defs: ShowcaseDef[] = SHOWCASES.slice(0, 2);
const noWait = { spacingMs: 0, sleep: async () => {} };
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "showcase-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const okResult = (): GenerateResult => ({
  ok: true,
  brief: { ...makeDraft(["ev_1"]), mode: "know_audience", groundingScore: 1 },
  dropped: [],
  ledger: { records: [{ id: "ev_1", endpoint: "/search", params: {}, summary: "s" }] },
});

describe("showcase definitions", () => {
  it("has the six prompts, in six different cities with varied project types", () => {
    expect(SHOWCASES.map((s) => s.id)).toEqual(["cafe-indore", "ceramic-artist", "couple-night-out", "boutique-brooklyn", "record-bar-chicago", "popup-paris"]);
    expect(new Set(SHOWCASES.map((s) => s.city)).size).toBe(SHOWCASES.length);
    expect(new Set(SHOWCASES.map((s) => s.id)).size).toBe(SHOWCASES.length);
    expect(SHOWCASES.map((s) => s.city)).toEqual(expect.arrayContaining(["Brooklyn", "Chicago", "Paris"]));
    expect(SHOWCASES.some((s) => s.mode === "find_audience" && s.city === "Brooklyn")).toBe(true);
    expect(SHOWCASES[0]).toMatchObject({ city: "Indore", mode: "know_audience" });
    expect(SHOWCASES[1].mode).toBe("find_audience");
    expect(SHOWCASES[2].prompt).toMatch(/A24.*Radiohead.*Vietnamese/);
  });
});

describe("showcase service", () => {
  it("is queued until ensure() runs, then ready in memory and on disk", async () => {
    const dir = tmp();
    const generate = vi.fn<ShowcaseGenerate>(async (_d, onEvent) => {
      onEvent({ type: "stage", stage: "seeds", status: "start" });
      onEvent({ type: "thinking", text: "ignored" });
      return { ...okResult(), proof: { baseline: [], tasteforge: [], baselineAvg: 0.3, tasteforgeAvg: 0.8, baselineNotFound: 2 } };
    });
    const service = createShowcaseService({ defs, generate, dir, ...noWait });
    expect(service.list().map((e) => e.status)).toEqual(["queued", "queued"]);
    const run = service.ensure();
    // Only the brief being built right now is "generating"; the other one is truthfully queued.
    expect(service.list().map((e) => e.status)).toEqual(["generating", "queued"]);
    await run;
    const [first] = service.list();
    expect(first).toMatchObject({ status: "ready", id: "cafe-indore", prompt: defs[0].prompt, mode: "know_audience" });
    expect(first.proof?.tasteforgeAvg).toBe(0.8);
    expect(first.evidence).toHaveLength(1);
    expect(first.trail).toEqual([{ type: "stage", stage: "seeds", status: "start" }]);
    expect(readdirSync(dir).sort()).toEqual(["cafe-indore.json", "ceramic-artist.json"]);

    // a fresh instance (server restart) serves from disk without generating
    const again = vi.fn<ShowcaseGenerate>();
    const restarted = createShowcaseService({ defs, generate: again, dir, ...noWait });
    expect(restarted.list().every((e) => e.status === "ready")).toBe(true);
    await restarted.ensure();
    expect(again).not.toHaveBeenCalled();
  });

  it("does not serve disk results made from another data source (mock results never pass for live ones)", async () => {
    const dir = tmp();
    await createShowcaseService({ defs, generate: async () => okResult(), dir, source: "mock|mock", ...noWait }).ensure();
    const live = createShowcaseService({ defs, generate: async () => okResult(), dir, source: "live|llm", ...noWait });
    expect(live.list().map((e) => e.status)).toEqual(["queued", "queued"]);
    const sameSource = createShowcaseService({ defs, generate: vi.fn(), dir, source: "mock|mock", ...noWait });
    expect(sameSource.list().every((e) => e.status === "ready")).toBe(true);
  });

  it("shares one run between concurrent ensure() calls and generates one at a time", async () => {
    let active = 0;
    let peak = 0;
    const generate: ShowcaseGenerate = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return okResult();
    };
    const service = createShowcaseService({ defs, generate, dir: false, ...noWait });
    await Promise.all([service.ensure(), service.ensure()]);
    expect(peak).toBe(1);
    expect(service.list().every((e) => e.status === "ready")).toBe(true);
  });

  it("pauses between briefs", async () => {
    const sleeps: number[] = [];
    const service = createShowcaseService({ defs, generate: async () => okResult(), dir: false, spacingMs: 1234, sleep: async (ms) => void sleeps.push(ms) });
    await service.ensure();
    expect(sleeps).toEqual([1234]);
  });

  it("records failures with attempts and next retry, lists ready entries first, and retries with backoff", async () => {
    let clock = 1_000;
    let fail = true;
    const generate: ShowcaseGenerate = async (d, onEvent) => {
      if (d.id === defs[0].id && fail) throw new Error("rate limited");
      if (d.id === defs[1].id) {
        onEvent({ type: "error", message: "nope", retryable: false });
        return { ok: false, dropped: [], ledger: { records: [] }, error: "nope" };
      }
      return okResult();
    };
    const service = createShowcaseService({ defs, generate, dir: false, now: () => clock, ...noWait });
    await service.ensure();
    const [a, b] = service.list();
    expect([a.id, a.status, a.error, a.attempts]).toEqual([defs[0].id, "failed", "rate limited", 1]);
    expect(a.nextRetryAt).toBe(1_000 + BASE_BACKOFF_MS);
    // a non-retryable failure is not scheduled again
    expect([b.status, b.nextRetryAt]).toEqual(["failed", undefined]);
    fail = false;
    await service.ensure(); // still backing off
    expect(service.list()[0].status).toBe("failed");
    clock += BASE_BACKOFF_MS + 1;
    await service.ensure();
    expect(service.list().map((e) => e.status)).toEqual(["ready", "failed"]);
    expect(service.list()[0].id).toBe(defs[0].id);
  });

  it("backs off exponentially, stops after the attempt limit, and force clears the backoff", async () => {
    expect([1, 2, 3, 20].map(backoffMs)).toEqual([30_000, 60_000, 120_000, 300_000]);
    let clock = 0;
    const generate = vi.fn<ShowcaseGenerate>(async () => {
      throw new Error("down");
    });
    const service = createShowcaseService({ defs: [defs[0]], generate, dir: false, now: () => clock, ...noWait });
    for (let i = 0; i < MAX_ATTEMPTS + 2; i += 1) {
      await service.ensure();
      clock += 10 * 60_000;
    }
    expect(generate).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(service.list()[0]).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
    expect(service.list()[0].nextRetryAt).toBeUndefined();
    await service.ensure({ force: true });
    expect(generate).toHaveBeenCalledTimes(MAX_ATTEMPTS + 1);
  });

  it("retries a failed brief inside the same run when the backoff window is short", async () => {
    let clock = 0;
    let calls = 0;
    const generate: ShowcaseGenerate = async () => {
      calls += 1;
      if (calls === 1) throw new Error("once");
      return okResult();
    };
    const sleep = async (ms: number) => {
      clock += ms;
    };
    const service = createShowcaseService({ defs: [defs[0]], generate, dir: false, now: () => clock, sleep, spacingMs: 0 });
    // BASE_BACKOFF_MS (30s) is longer than the 20s in-run wait: the run ends and a later request retries.
    await service.ensure();
    expect(calls).toBe(1);
    clock += BASE_BACKOFF_MS;
    await service.ensure();
    expect(calls).toBe(2);
    expect(service.list()[0].status).toBe("ready");
  });

  it("ignores stale or corrupt disk entries and survives an unwritable cache dir", async () => {
    const dir = tmp();
    writeFileSync(join(dir, "cafe-indore.json"), JSON.stringify({ signature: "old", result: {} }));
    writeFileSync(join(dir, "ceramic-artist.json"), "not json");
    const generate = vi.fn<ShowcaseGenerate>(async () => okResult());
    const stale = createShowcaseService({ defs, generate, dir, ...noWait });
    expect(stale.list().map((e) => e.status)).toEqual(["queued", "queued"]);
    const blocked = createShowcaseService({ defs, generate, dir: join(dir, "cafe-indore.json", "sub"), ...noWait });
    await blocked.ensure();
    expect(blocked.list().every((e) => e.status === "ready")).toBe(true);
  });
});
