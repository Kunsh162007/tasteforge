/**
 * Pre-warms the deployed showcase: polls GET /api/showcase until all example briefs are ready, so a judge opening
 * the site finds them already built. Run it a few minutes before judging (the first request also wakes a sleeping
 * free instance, which takes about 30 s).
 *
 *   npm run warm -- [--url=https://tasteforge-fa98.onrender.com] [--timeout=1200] [--interval=8]
 *
 * Exits 0 when every brief is ready, 1 if time runs out. It only reads the public showcase endpoint (plus one
 * rate-limited retry request when a brief has given up) and never needs a key.
 */
const arg = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = (line: string): void => void process.stdout.write(`${line}\n`);

const DEFAULT_URL = "https://tasteforge-fa98.onrender.com";
const DEFAULT_TIMEOUT_S = 1200;
const DEFAULT_INTERVAL_S = 8;
const REQUEST_TIMEOUT_MS = 90_000;
const RETRY_EVERY_MS = 65_000;

type Item = { readonly id: string; readonly status: "queued" | "generating" | "ready" | "failed"; readonly error?: string; readonly nextRetryAt?: number };

async function fetchItems(base: string, retry: boolean): Promise<readonly Item[] | undefined> {
  try {
    const res = await fetch(`${base}/api/showcase${retry ? "?retry=1" : ""}`, { cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) {
      out(`  server answered HTTP ${res.status}`);
      return undefined;
    }
    const json = (await res.json()) as { items?: Item[] };
    return Array.isArray(json.items) ? json.items : undefined;
  } catch (e) {
    out(`  not reachable yet (${e instanceof Error ? e.message : "error"}); a sleeping instance needs about 30 s to wake`);
    return undefined;
  }
}

function summary(items: readonly Item[]): string {
  const by = (s: Item["status"]): string[] => items.filter((i) => i.status === s).map((i) => i.id);
  const part = (label: string, ids: string[]): string[] => (ids.length > 0 ? [`${label}: ${ids.join(", ")}`] : []);
  return [`ready ${by("ready").length}/${items.length}`, ...part("building", by("generating")), ...part("queued", by("queued")), ...part("failed", by("failed"))].join(" | ");
}

/** Briefs whose automatic retries are used up stay failed until someone asks again. */
const gaveUp = (items: readonly Item[]): boolean => items.some((i) => i.status === "failed" && i.nextRetryAt === undefined);

async function main(): Promise<number> {
  const base = (arg("url") ?? process.env.WARM_URL ?? DEFAULT_URL).replace(/\/$/, "");
  const deadline = Date.now() + Number(arg("timeout") ?? DEFAULT_TIMEOUT_S) * 1000;
  const interval = Number(arg("interval") ?? DEFAULT_INTERVAL_S) * 1000;
  out(`Warming ${base}`);
  let lastRetry = 0;
  while (Date.now() < deadline) {
    let items = await fetchItems(base, false);
    if (items && gaveUp(items) && Date.now() - lastRetry > RETRY_EVERY_MS) {
      lastRetry = Date.now();
      out("  restarting briefs that gave up");
      items = (await fetchItems(base, true)) ?? items;
    }
    if (items) {
      out(`[${new Date().toLocaleTimeString()}] ${summary(items)}`);
      if (items.length > 0 && items.every((i) => i.status === "ready")) {
        out("All showcase briefs are ready.");
        return 0;
      }
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  out("Timed out before every brief was ready. Run it again; the server keeps building in the background.");
  return 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    process.stderr.write(`warm failed: ${e instanceof Error ? e.message : "unknown error"}\n`);
    process.exitCode = 1;
  },
);
