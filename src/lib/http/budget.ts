import { singleton } from "@/lib/singleton";

/** Demo-wide capacity guard: a cap on pipelines running at once and a daily budget of LLM calls. */

export type BudgetOptions = {
  readonly maxConcurrent: number;
  readonly dailyCalls: number;
  readonly now?: () => number;
};

export type Admission =
  | { readonly ok: true; release(): void }
  | { readonly ok: false; readonly reason: "busy" | "daily_budget"; readonly retryAfterSeconds: number; readonly message: string };

export type Budget = {
  /** Reserves a run slot, or says why the demo cannot take another run right now. */
  admit(): Admission;
  /** Counts one LLM call against today's budget. */
  recordCall(): void;
  snapshot(): { readonly active: number; readonly callsToday: number };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const BUSY_RETRY_SECONDS = 15;
export const DEFAULT_MAX_CONCURRENT = 4;
export const DEFAULT_DAILY_LLM_CALLS = 600;

const BUSY_MESSAGE = "The demo is busy right now with other briefs. Please try again in a few seconds.";
const BUDGET_MESSAGE = "The demo has used up its free AI quota for today. Please try again tomorrow (UTC), or open a showcase brief.";

const dayOf = (t: number): number => Math.floor(t / DAY_MS);

export function createBudget(o: BudgetOptions): Budget {
  const now = o.now ?? Date.now;
  let active = 0;
  let day = dayOf(now());
  let calls = 0;

  function rollDay(): void {
    const today = dayOf(now());
    if (today !== day) {
      day = today;
      calls = 0;
    }
  }

  return {
    admit() {
      rollDay();
      if (calls >= o.dailyCalls) {
        const untilMidnight = Math.ceil(((day + 1) * DAY_MS - now()) / 1000);
        return { ok: false, reason: "daily_budget", retryAfterSeconds: untilMidnight, message: BUDGET_MESSAGE };
      }
      if (active >= o.maxConcurrent) {
        return { ok: false, reason: "busy", retryAfterSeconds: BUSY_RETRY_SECONDS, message: BUSY_MESSAGE };
      }
      active += 1;
      let released = false;
      return {
        ok: true,
        release() {
          if (released) return;
          released = true;
          active -= 1;
        },
      };
    },
    recordCall() {
      rollDay();
      calls += 1;
    },
    snapshot() {
      rollDay();
      return { active, callsToday: calls };
    },
  };
}

type Env = Readonly<Record<string, string | undefined>>;

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** MAX_CONCURRENT_BRIEFS and DAILY_LLM_BUDGET override the defaults; invalid values fall back to them. */
export function budgetFromEnv(env: Env = process.env, now?: () => number): Budget {
  return createBudget({
    maxConcurrent: positiveInt(env.MAX_CONCURRENT_BRIEFS, DEFAULT_MAX_CONCURRENT),
    dailyCalls: positiveInt(env.DAILY_LLM_BUDGET, DEFAULT_DAILY_LLM_CALLS),
    now,
  });
}

/** The one budget shared by every route and the showcase generator. */
export const getBudget = (): Budget => singleton("budget", () => budgetFromEnv());
