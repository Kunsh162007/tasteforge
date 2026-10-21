import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentEvent, Brief, BriefMode, BriefSignals, DroppedItem, Evidence, GenerateResult, TasteProof } from "@/lib/agent";

/**
 * Showcase briefs (plan section 8.3): a few example prompts pre-run on the server and cached in memory
 * and in a git-ignored directory, so judges get an instant result even when free tiers are throttled.
 * Results hold Qloo-derived data and therefore never leave the server cache directory.
 *
 * Generation is deliberately gentle on free tiers: one brief at a time, a pause between briefs, and
 * exponential backoff before a failed brief is retried.
 */

export type ShowcaseDef = {
  readonly id: string;
  readonly title: string;
  readonly prompt: string;
  readonly mode: BriefMode;
  readonly city?: string;
};

export const SHOWCASES: readonly ShowcaseDef[] = [
  {
    id: "record-bar-chicago",
    title: "A record-store bar in Chicago",
    prompt:
      "We are opening a record-store bar in Chicago where people dig through vinyl over natural wine. Our crowd loves jazz, soul and post-punk.",
    mode: "know_audience",
    city: "Chicago",
  },
  {
    id: "cafe-indore",
    title: "A cafe for young professionals in Indore",
    prompt:
      "I am opening a cafe in Indore for young professionals who love indie music and slow living. Cosy, unhurried, great coffee.",
    mode: "know_audience",
    city: "Indore",
  },
  {
    id: "wine-bar-nyc",
    title: "A wine bar for A24, Radiohead and Vietnamese food lovers in New York",
    prompt:
      "We are opening a wine bar in New York for people who love A24 films, Radiohead and Vietnamese food. Build the taste profile for the room, the playlist and the menu.",
    mode: "know_audience",
    city: "New York",
  },
  {
    id: "popup-paris",
    title: "A three-week pop-up bakery in Paris",
    prompt:
      "I am running a three-week pop-up bakery in Paris for design-minded locals who love slow mornings, ceramics and film photography.",
    mode: "know_audience",
    city: "Paris",
  },
  {
    id: "boutique-brooklyn",
    title: "A vintage-leaning boutique in Brooklyn",
    prompt:
      "I am opening a small independent clothing boutique in Brooklyn selling vintage-inspired pieces made by local designers. Find the audience that would love it and where to reach them.",
    mode: "find_audience",
    city: "Brooklyn",
  },
  {
    id: "ceramic-artist",
    title: "Finding the audience for handmade ceramics",
    prompt:
      "I am a ceramic artist making handmade, Japanese-inspired tableware. Find the audience that would love it and where to reach them.",
    mode: "find_audience",
    city: "London",
  },
];

/** Bump when the result shape changes so stale disk entries are ignored. */
const CACHE_VERSION = 6;
/** First retry delay after a failure; doubles per attempt up to MAX_BACKOFF_MS. */
export const BASE_BACKOFF_MS = 30_000;
export const MAX_BACKOFF_MS = 5 * 60_000;
export const MAX_ATTEMPTS = 4;
/** Pause between two generations so free-tier LLM limits are not hit by back-to-back briefs. */
export const SPACING_MS = 4_000;
/** A run waits for a retry window only if it opens this soon; otherwise a later request retries. */
const MAX_IN_RUN_WAIT_MS = 20_000;
const MAX_RUN_STEPS = 40;
const SHOWCASE_TIMEOUT_MS = 90_000;
export const DEFAULT_CACHE_DIR = join(".cache", "showcase");

const TRAIL_TYPES = new Set<AgentEvent["type"]>(["stage", "tool_call", "tool_result"]);

export type ShowcaseResult = {
  readonly brief: Brief;
  readonly dropped: readonly DroppedItem[];
  readonly evidence: readonly Evidence[];
  readonly proof?: TasteProof;
  /** The taste signals behind the brief, so a refine run can reuse them. */
  readonly signals?: BriefSignals;
  /** Stage and graph-walk events, so the UI can replay how the brief was made. */
  readonly trail: readonly AgentEvent[];
};

/** queued: waiting its turn; generating: the one brief being built right now; failed: see error / nextRetryAt. */
export type ShowcaseStatus = "queued" | "generating" | "ready" | "failed";

export type ShowcaseEntry = ShowcaseDef & {
  readonly status: ShowcaseStatus;
  readonly error?: string;
  /** Failed attempts so far. */
  readonly attempts?: number;
  /** When the next automatic retry may start (ms since epoch); absent once retries are exhausted or pointless. */
  readonly nextRetryAt?: number;
} & Partial<ShowcaseResult>;

export type ShowcaseGenerate = (def: ShowcaseDef, onEvent: (e: AgentEvent) => void) => Promise<GenerateResult>;

/** Runs the Taste Proof again for a finished brief that has none (it needs only the baseline call and Qloo, not the whole pipeline). */
export type ShowcaseReprove = (def: ShowcaseDef, result: GenerateResult, onEvent: (e: AgentEvent) => void) => Promise<GenerateResult>;

export type ShowcaseOptions = {
  readonly defs?: readonly ShowcaseDef[];
  readonly generate: ShowcaseGenerate;
  /** Second chance for a brief whose Taste Proof came back empty: a showcase should not ship without one if it can be avoided. */
  readonly reprove?: ShowcaseReprove;
  /** Disk cache directory; pass false to keep results in memory only. */
  readonly dir?: string | false;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly spacingMs?: number;
  /** Tells apart results made from different data sources (mock and live Qloo, scripted and real LLM) in the shared disk cache. */
  readonly source?: string;
};

export type EnsureOptions = {
  /** Clear failure backoff and retry failed briefs now (still one at a time, still spaced). */
  readonly force?: boolean;
  /** Throw away every cached brief (memory and disk) and build them all again, e.g. after the pipeline changed. */
  readonly regenerate?: boolean;
};

export type ShowcaseService = {
  /** Ready entries first (UI shows the first one), then the rest in definition order. */
  list(): ShowcaseEntry[];
  /** Generates every missing showcase one at a time; concurrent calls share one run. */
  ensure(options?: EnsureOptions): Promise<void>;
};

const signatureOf = (d: ShowcaseDef, source: string): string =>
  createHash("sha256").update(JSON.stringify([CACHE_VERSION, d.prompt, d.mode, d.city ?? "", source])).digest("hex").slice(0, 16);

type DiskEntry = { readonly signature: string; readonly result: ShowcaseResult };

function readDisk(dir: string, def: ShowcaseDef, source: string): ShowcaseResult | undefined {
  try {
    const entry = JSON.parse(readFileSync(join(dir, `${def.id}.json`), "utf8")) as DiskEntry;
    return entry.signature === signatureOf(def, source) ? entry.result : undefined;
  } catch {
    return undefined;
  }
}

function writeDisk(dir: string, def: ShowcaseDef, result: ShowcaseResult, source: string): void {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${def.id}.json`), JSON.stringify({ signature: signatureOf(def, source), result } satisfies DiskEntry));
  } catch {
    // The disk cache is a convenience; the in-memory copy still serves requests.
  }
}

function removeDisk(dir: string, defs: readonly ShowcaseDef[]): void {
  for (const def of defs) rmSync(join(dir, `${def.id}.json`), { force: true });
}

type Failure = { readonly message: string; readonly at: number; readonly attempts: number; readonly retryable: boolean };

/** Delay before the retry that follows `attempts` failures: 30s, 60s, 120s, capped at 5 minutes. */
export const backoffMs = (attempts: number): number => Math.min(BASE_BACKOFF_MS * 2 ** Math.max(attempts - 1, 0), MAX_BACKOFF_MS);

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function createShowcaseService(o: ShowcaseOptions): ShowcaseService {
  const defs = o.defs ?? SHOWCASES;
  const dir = o.dir === undefined ? DEFAULT_CACHE_DIR : o.dir;
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? defaultSleep;
  const spacingMs = o.spacingMs ?? SPACING_MS;
  const source = o.source ?? "";
  const results = new Map<string, ShowcaseResult>();
  const failures = new Map<string, Failure>();
  let running: Promise<void> | undefined;
  let activeId: string | undefined;
  let loaded = false;

  function loadDisk(): void {
    if (loaded) return;
    loaded = true;
    if (dir === false) return;
    for (const def of defs) {
      const hit = readDisk(dir, def, source);
      if (hit) results.set(def.id, hit);
    }
  }

  const retryAt = (f: Failure): number | undefined => (f.retryable && f.attempts < MAX_ATTEMPTS ? f.at + backoffMs(f.attempts) : undefined);

  async function generateOne(def: ShowcaseDef): Promise<void> {
    const events: AgentEvent[] = [];
    let retryable = true;
    const previous = failures.get(def.id);
    try {
      const record = (e: AgentEvent): void => {
        if (TRAIL_TYPES.has(e.type)) events.push(e);
        if (e.type === "error") retryable = e.retryable;
      };
      let r = await o.generate(def, record);
      if (!r.ok || !r.brief) throw new Error(r.error ?? "The brief could not be built.");
      // The proof is the headline feature: one more try before a brief goes out without it (the reason stays in the trail).
      if (!r.proof && o.reprove) r = await o.reprove(def, r, record).catch(() => r);
      const brief = r.brief;
      if (!brief) throw new Error("The brief could not be built.");
      const result: ShowcaseResult = {
        brief,
        dropped: r.dropped,
        evidence: r.ledger.records,
        ...(r.proof ? { proof: r.proof } : {}),
        ...(r.signals ? { signals: r.signals } : {}),
        trail: events,
      };
      results.set(def.id, result);
      failures.delete(def.id);
      if (dir !== false) writeDisk(dir, def, result, source);
    } catch (e) {
      failures.set(def.id, {
        message: e instanceof Error ? e.message : "The brief could not be built.",
        at: now(),
        attempts: (previous?.attempts ?? 0) + 1,
        retryable,
      });
    }
  }

  /** Next brief that is missing and not waiting out a backoff. */
  function nextDue(): ShowcaseDef | undefined {
    return defs.find((d) => {
      if (results.has(d.id)) return false;
      const failure = failures.get(d.id);
      if (!failure) return true;
      const at = retryAt(failure);
      return at !== undefined && now() >= at;
    });
  }

  function soonestRetry(): number | undefined {
    const times = [...failures.entries()]
      .flatMap(([id, f]) => (results.has(id) ? [] : [retryAt(f)]))
      .filter((t): t is number => t !== undefined);
    return times.length === 0 ? undefined : Math.min(...times);
  }

  /** One at a time, spaced out; failed briefs are retried once their backoff has passed. */
  async function run(force: boolean): Promise<void> {
    if (force) failures.clear();
    let generated = false;
    for (let step = 0; step < MAX_RUN_STEPS; step += 1) {
      const due = nextDue();
      if (!due) {
        const wake = soonestRetry();
        if (wake === undefined || wake - now() > MAX_IN_RUN_WAIT_MS) return;
        await sleep(Math.max(wake - now(), 0));
        continue;
      }
      if (generated) await sleep(spacingMs);
      generated = true;
      activeId = due.id;
      await generateOne(due);
      activeId = undefined;
    }
  }

  function entryFor(def: ShowcaseDef): ShowcaseEntry {
    const result = results.get(def.id);
    if (result) return { ...def, status: "ready", ...result };
    if (activeId === def.id) return { ...def, status: "generating" };
    const failure = failures.get(def.id);
    if (failure) {
      const next = retryAt(failure);
      return { ...def, status: "failed", error: failure.message, attempts: failure.attempts, ...(next !== undefined ? { nextRetryAt: next } : {}) };
    }
    return { ...def, status: "queued" };
  }

  return {
    list() {
      loadDisk();
      const entries = defs.map(entryFor);
      return [...entries.filter((e) => e.status === "ready"), ...entries.filter((e) => e.status !== "ready")];
    },
    ensure(options = {}) {
      loadDisk();
      if (options.regenerate && !running) {
        results.clear();
        failures.clear();
        if (dir !== false) removeDisk(dir, defs);
      }
      running ??= run(options.force === true).finally(() => {
        running = undefined;
        activeId = undefined;
      });
      return running;
    },
  };
}

export const SHOWCASE_TIMEOUT = SHOWCASE_TIMEOUT_MS;
