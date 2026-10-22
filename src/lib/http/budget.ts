import { singleton } from "@/lib/singleton";

/** Demo-wide capacity guard: a cap on pipelines running at once. */

export type BudgetOptions = {
  readonly maxConcurrent: number;
};

export type Admission =
  | { readonly ok: true; release(): void }
  | { readonly ok: false; readonly reason: "busy"; readonly retryAfterSeconds: number; readonly message: string };

export type Budget = {
  /** Reserves a run slot, or says why the demo cannot take another run right now. */
  admit(): Admission;
  snapshot(): { readonly active: number };
};

const BUSY_RETRY_SECONDS = 15;
export const DEFAULT_MAX_CONCURRENT = 4;

const BUSY_MESSAGE = "The demo is busy right now with other briefs. Please try again in a few seconds.";

export function createBudget(o: BudgetOptions): Budget {
  let active = 0;

  return {
    admit() {
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
    snapshot() {
      return { active };
    },
  };
}

type Env = Readonly<Record<string, string | undefined>>;

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** MAX_CONCURRENT_BRIEFS overrides the default; an invalid value falls back to it. */
export function budgetFromEnv(env: Env = process.env): Budget {
  return createBudget({ maxConcurrent: positiveInt(env.MAX_CONCURRENT_BRIEFS, DEFAULT_MAX_CONCURRENT) });
}

/** The one budget shared by every route and the showcase generator. */
export const getBudget = (): Budget => singleton("budget", () => budgetFromEnv());
