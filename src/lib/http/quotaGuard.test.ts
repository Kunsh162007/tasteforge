import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as brief } from "@/app/api/brief/route";
import { GET as health } from "@/app/api/health/route";
import { QUOTA_PAUSED_MESSAGE, recordRateLimitHeaders, resetQuota } from "@/lib/qloo/quota";
import { resetSingletons } from "@/lib/singleton";
import type { ShowcaseDef } from "@/lib/showcase";
import { guardShowcaseGenerate } from "./showcaseService";
import { handleStreamRoute, type StreamRouteSpec } from "./streamRoute";
import { createRateLimiter } from "@/lib/rateLimit";

vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => undefined }));

const KEYS = ["LLM_PROVIDER", "QLOO_MODE", "LEDGER_SECRET", "QLOO_MONTH_RESERVE"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  process.env.LLM_PROVIDER = "mock";
  process.env.QLOO_MODE = "mock";
  process.env.LEDGER_SECRET = "test-ledger-secret-0123456789";
  delete process.env.QLOO_MONTH_RESERVE;
  resetSingletons();
  resetQuota();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetSingletons();
  resetQuota();
});

const seedMonth = (remaining: number): void =>
  recordRateLimitHeaders(
    new Headers({ "x-month-ratelimit-remaining": String(remaining), "x-month-ratelimit-limit": "50000", "x-month-ratelimit-reset": "2548800" }),
  );

const post = (url: string, body: unknown): Request =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "true-client-ip": "7.7.7.7" },
    body: JSON.stringify(body),
  });

async function frames(res: Response): Promise<{ event: string; data: Record<string, unknown> }[]> {
  return (await res.text())
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const [event, data] = block.split("\n");
      return { event: event.replace("event: ", ""), data: JSON.parse(data.replace("data: ", "")) as Record<string, unknown> };
    });
}

const BRIEF_BODY = { prompt: "A cafe for people who love Radiohead, indie music and slow living", mode: "know_audience", city: "Brooklyn" };

describe("monthly quota guard on live routes", () => {
  it("refuses a new brief below the reserve with a friendly, non-retryable SSE error", async () => {
    seedMonth(1999);
    const res = await brief(post("/api/brief", BRIEF_BODY));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const f = await frames(res);
    expect(f.map((x) => x.event)).toEqual(["error", "done"]);
    expect(f[0].data).toMatchObject({ type: "error", message: QUOTA_PAUSED_MESSAGE, retryable: false });
    expect(f[1].data).toMatchObject({ ok: false });
  });

  it("lets a brief run at the reserve", async () => {
    seedMonth(2000);
    const f = await frames(await brief(post("/api/brief", BRIEF_BODY)));
    expect(f.some((x) => x.event === "brief")).toBe(true);
  });

  it("honours QLOO_MONTH_RESERVE", async () => {
    process.env.QLOO_MONTH_RESERVE = "100";
    seedMonth(1500);
    const f = await frames(await brief(post("/api/brief", BRIEF_BODY)));
    expect(f.some((x) => x.event === "brief")).toBe(true);
  });

  it("still validates the request before pausing", async () => {
    seedMonth(10);
    expect((await brief(post("/api/brief", { prompt: "x" }))).status).toBe(400);
  });

  it("guards every route built on handleStreamRoute (refine and compare included)", async () => {
    seedMonth(10);
    const spec: StreamRouteSpec<null> = {
      tooManyMessage: "slow",
      maxBodyBytes: 100,
      bodyLimitLabel: "100 B",
      parse: () => ({ ok: true, value: null }),
      run: async () => true,
    };
    const res = await handleStreamRoute(post("/x", {}), spec, { limiter: createRateLimiter({ limit: 5, windowMs: 1000 }) });
    expect((await frames(res))[0].data).toMatchObject({ retryable: false, message: QUOTA_PAUSED_MESSAGE });
  });
});

describe("showcase reserve", () => {
  const def = { id: "a", prompt: "p", mode: "know_audience", city: "Paris" } as unknown as ShowcaseDef;
  const ok = { ok: true } as never;

  it("generates while month-remaining is above the smaller showcase reserve", async () => {
    seedMonth(1500);
    const generate = vi.fn(async () => ok);
    expect(await guardShowcaseGenerate(generate)(def, () => undefined)).toBe(ok);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("refuses without calling Qloo once below the showcase reserve", async () => {
    seedMonth(999);
    const generate = vi.fn(async () => ok);
    const events: unknown[] = [];
    const result = await guardShowcaseGenerate(generate)(def, (e) => events.push(e));
    expect(generate).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(events).toEqual([{ type: "error", message: QUOTA_PAUSED_MESSAGE, retryable: false }]);
  });
});

describe("/api/health quota", () => {
  it("reports null numbers before any live call and never leaks secrets", async () => {
    const body = (await (await health()).json()) as { qloo: Record<string, unknown> };
    expect(body.qloo.quota).toEqual({ monthRemaining: null, monthLimit: null, monthResetsAt: null, paused: false });
    expect(JSON.stringify(body)).not.toMatch(/api[_-]?key"\s*:\s*"/i);
  });

  it("reports remaining, limit, reset and paused state", async () => {
    seedMonth(1500);
    const body = (await (await health()).json()) as { qloo: { quota: Record<string, unknown> } };
    expect(body.qloo.quota).toMatchObject({ monthRemaining: 1500, monthLimit: 50000, paused: true });
    expect(typeof body.qloo.quota.monthResetsAt).toBe("string");
  });
});
