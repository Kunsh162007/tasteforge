import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as compare } from "@/app/api/brief/compare/route";
import { POST as brief } from "@/app/api/brief/route";
import { POST as refine } from "@/app/api/brief/refine/route";
import { POST as verify } from "@/app/api/verify/route";
import type { AgentEvent } from "@/lib/agent";
import { resetSingletons } from "@/lib/singleton";
import { createBudget } from "./budget";
import { getRouteDeps } from "./deps";
import { getPipelineLimiter, PIPELINE_RATE_LIMIT } from "./guards";
import { handleStreamRoute, type StreamRouteSpec } from "./streamRoute";
import { createRateLimiter } from "@/lib/rateLimit";
import { createLedgerSigner } from "@/lib/security/ledgerSig";
import { slimEvidence } from "@/lib/share/codec";

const ENV_KEYS = ["LLM_PROVIDER", "QLOO_MODE", "LEDGER_SECRET", "MAX_CONCURRENT_BRIEFS"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.LLM_PROVIDER = "mock";
  process.env.QLOO_MODE = "mock";
  process.env.LEDGER_SECRET = "test-ledger-secret-0123456789";
  delete process.env.MAX_CONCURRENT_BRIEFS;
  resetSingletons();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetSingletons();
});

const post = (url: string, body: unknown, headers: Record<string, string> = {}): Request =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "true-client-ip": "9.9.9.9", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

type Frame = { event: string; data: Record<string, unknown> };
async function frames(res: Response): Promise<Frame[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const [event, data] = block.split("\n");
      return { event: event.replace("event: ", ""), data: JSON.parse(data.replace("data: ", "")) as Record<string, unknown> };
    });
}

const BRIEF_BODY = { prompt: "A cafe for people who love Radiohead, indie music and slow living", mode: "know_audience", city: "Brooklyn" };

async function runBrief(): Promise<Extract<AgentEvent, { type: "brief" }>> {
  const res = await brief(post("/api/brief", BRIEF_BODY));
  expect(res.status).toBe(200);
  const event = (await frames(res)).find((f) => f.event === "brief");
  if (!event) throw new Error("no brief event");
  return event.data as unknown as Extract<AgentEvent, { type: "brief" }>;
}

describe("shared rate limit", () => {
  it("counts brief, refine and compare against one allowance per visitor", async () => {
    const limiter = getPipelineLimiter();
    expect(getPipelineLimiter()).toBe(limiter);
    // Bad bodies still use a slot, so the three routes can be mixed to reach the shared limit.
    for (let i = 0; i < PIPELINE_RATE_LIMIT; i += 1) {
      const route = [brief, refine, compare][i % 3];
      expect((await route(post("/x", "{}"))).status).toBe(400);
    }
    for (const route of [brief, refine, compare]) {
      const res = await route(post("/x", "{}"));
      expect(res.status).toBe(429);
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    }
    expect((await brief(post("/x", "{}", { "true-client-ip": "8.8.8.8" }))).status).toBe(400);
  });

  it("keys on the platform address, not on a spoofed first X-Forwarded-For entry", async () => {
    for (let i = 0; i < PIPELINE_RATE_LIMIT; i += 1) {
      await brief(post("/x", "{}", { "true-client-ip": "", "x-forwarded-for": `1.2.3.${i}, 5.5.5.5` }));
    }
    expect((await brief(post("/x", "{}", { "true-client-ip": "", "x-forwarded-for": "6.6.6.6, 5.5.5.5" }))).status).toBe(429);
  });
});

describe("request limits", () => {
  it("rejects an oversized Content-Length with 413 before reading", async () => {
    const res = await brief(post("/api/brief", "{}", { "content-length": "999999" }));
    expect(res.status).toBe(413);
  });

  it("rejects invalid JSON and invalid requests with 400", async () => {
    expect((await brief(post("/api/brief", "{nope"))).status).toBe(400);
    expect((await brief(post("/api/brief", { prompt: "x", mode: "know_audience" }))).status).toBe(400);
  });
});

describe("dependencies and capacity", () => {
  const spec: StreamRouteSpec<null> = {
    tooManyMessage: "slow down",
    maxBodyBytes: 100,
    bodyLimitLabel: "100 B",
    parse: () => ({ ok: true, value: null }),
    run: async (_v, _d, emit) => {
      emit({ type: "thinking", text: "hi" });
      return true;
    },
  };
  const env = (over = {}) => ({
    limiter: createRateLimiter({ limit: 100, windowMs: 1000 }),
    signer: createLedgerSigner("x".repeat(20)),
    deps: () => getRouteDeps(),
    ...over,
  });

  it("answers 503 when the server is not configured", async () => {
    const res = await handleStreamRoute(post("/x", "{}"), spec, env({ deps: () => { throw new Error("no keys"); } }));
    expect(res.status).toBe(503);
  });

  it("answers a friendly retryable 503 when too many runs are active, and frees the slot afterwards", async () => {
    const budget = createBudget({ maxConcurrent: 1 });
    let release: () => void = () => undefined;
    const held = new Promise<boolean>((resolve) => (release = () => resolve(true)));
    const first = await handleStreamRoute(post("/x", "{}"), { ...spec, run: () => held }, env({ budget }));
    expect(first.status).toBe(200);
    const busy = await handleStreamRoute(post("/x", "{}"), spec, env({ budget }));
    expect(busy.status).toBe(503);
    expect(busy.headers.get("retry-after")).not.toBeNull();
    expect(((await busy.json()) as { error: string }).error).toMatch(/busy/i);
    release();
    await first.text();
    expect(budget.snapshot().active).toBe(0);
    expect((await handleStreamRoute(post("/x", "{}"), spec, env({ budget }))).status).toBe(200);
  });

  it("builds the LLM and Qloo clients once per process", () => {
    const a = getRouteDeps();
    const b = getRouteDeps();
    expect(b.llm).toBe(a.llm);
    expect(b.qloo).toBe(a.qloo);
  });

  it("releases the slot even when the run throws", async () => {
    const budget = createBudget({ maxConcurrent: 1 });
    const res = await handleStreamRoute(post("/x", "{}"), { ...spec, run: async () => { throw new Error("boom"); } }, env({ budget }));
    const out = await frames(res);
    expect(out.map((f) => f.event)).toEqual(["error", "done"]);
    expect(budget.snapshot().active).toBe(0);
  });
});

describe("evidence signatures", () => {
  it("signs the brief event, and the signatures work for refine, compare and verify", async () => {
    const event = await runBrief();
    expect(event.signatures?.signals).toBeTruthy();
    expect(Object.keys(event.signatures?.records ?? {})).toEqual(event.evidence.map((e) => e.id));

    const artist = event.brief.sound.artists[0];
    const cited = event.evidence.filter((e) => artist.evidence.includes(e.id));
    const refineBody = {
      ...BRIEF_BODY,
      brief: event.brief,
      evidence: cited,
      signals: event.signals,
      signatures: { records: event.signatures?.records, signals: event.signatures?.signals },
      feedback: { liked: [], disliked: [artist.qlooId], locked: [] },
    };
    const ok = await refine(post("/api/brief/refine", refineBody));
    expect(ok.status).toBe(200);
    expect((await frames(ok)).some((f) => f.event === "brief")).toBe(true);

    const compareOk = await compare(post("/api/brief/compare", { ...BRIEF_BODY, city: "London", signals: event.signals, signatures: { signals: event.signatures?.signals } }));
    expect(compareOk.status).toBe(200);
    await compareOk.text();

    const shared = event.evidence.map(slimEvidence);
    const good = await verify(post("/api/verify", { evidence: shared, signatures: event.signatures?.shared }));
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({ verified: true });
    const forged = shared.map((e, i) => (i === 0 ? { ...e, summary: "forged summary" } : e));
    const bad = await verify(post("/api/verify", { evidence: forged, signatures: event.signatures?.shared }));
    expect(await bad.json()).toEqual({ verified: false });
  });

  it("rejects refine with edited evidence, and compare with edited signals", async () => {
    const event = await runBrief();
    const artist = event.brief.sound.artists[0];
    const cited = event.evidence.filter((e) => artist.evidence.includes(e.id));
    const forged = cited.map((e) => ({ ...e, summary: "forged summary" }));
    const base = { ...BRIEF_BODY, brief: event.brief, signals: event.signals, signatures: { records: event.signatures?.records, signals: event.signatures?.signals }, feedback: { liked: [], disliked: [artist.qlooId], locked: [] } };
    const bad = await refine(post("/api/brief/refine", { ...base, evidence: forged }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toMatch(/verified/);
    const unsigned = await refine(post("/api/brief/refine", { ...base, evidence: cited, signatures: undefined }));
    expect(unsigned.status).toBe(400);

    const tamperedSignals = { ...event.signals, entityIds: ["MOCK-ARTIST-9"] };
    const badCompare = await compare(post("/api/brief/compare", { ...BRIEF_BODY, city: "London", signals: tamperedSignals, signatures: { signals: event.signatures?.signals } }));
    expect(badCompare.status).toBe(400);
  });
});

describe("POST /api/verify", () => {
  it("rejects malformed bodies and empty evidence", async () => {
    expect((await verify(post("/api/verify", { nope: 1 }))).status).toBe(400);
    expect((await verify(post("/api/verify", "{bad"))).status).toBe(400);
    const empty = await verify(post("/api/verify", { evidence: [], signatures: {} }));
    expect(await empty.json()).toEqual({ verified: false });
  });

  it("is rate limited per visitor", async () => {
    let last = 0;
    for (let i = 0; i < 70; i += 1) last = (await verify(post("/api/verify", { evidence: [], signatures: {} }))).status;
    expect(last).toBe(429);
  });
});
