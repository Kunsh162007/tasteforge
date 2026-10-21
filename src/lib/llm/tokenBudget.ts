/**
 * Per-model tokens-per-minute budget. Groq's free tier gives every model its own per-minute token limit, so the
 * cascade spreads load by asking this tracker which models still have room for a request before it picks one.
 *
 * Two sources feed it: the tokens of finished (or in-flight, estimated) requests, and, when Groq sends them, the
 * `x-ratelimit-*` headers, which are the provider's own count and win over the estimate.
 */

export type Observation = {
  /** Tokens the finished request used (prompt plus reply), from the provider's usage field. */
  readonly tokens?: number;
  /** `x-ratelimit-remaining-tokens`. */
  readonly remainingTokens?: number;
  /** `x-ratelimit-limit-tokens`. */
  readonly limitTokens?: number;
};

export type Reservation = {
  /** Replaces the estimate with what the request really used (or 0 when it failed before using any). */
  settle(actualTokens?: number): void;
};

export type TokenBudgetOptions = {
  readonly now?: () => number;
  /** Per-model limits by id ("groq:openai/gpt-oss-120b"); models without an entry are untracked unless `defaultLimit` is set. */
  readonly limits?: Readonly<Record<string, number>>;
  /** Limit for tracked providers' models that have no entry in `limits`. */
  readonly defaultLimit?: number;
  /** Which model ids are tracked at all (Gemini is not). */
  readonly tracks?: (id: string) => boolean;
};

const WINDOW_MS = 60_000;
/** A model with less than this share of its limit free after the request is treated as nearly spent. */
const SAFETY_MARGIN = 0.1;

type Entry = { readonly at: number; tokens: number; pending: boolean };
type Snapshot = { readonly at: number; readonly remaining: number };

type State = { entries: Entry[]; snapshot?: Snapshot; limit?: number };

export type TokenBudget = {
  /** Whether the model has a per-minute limit that is tracked. */
  tracked(id: string): boolean;
  limit(id: string): number;
  /** Tokens the model can take right now, or Infinity for an untracked model. */
  headroom(id: string): number;
  /** Whether a request of `tokens` fits with a safety margin left over. */
  fits(id: string, tokens: number): boolean;
  /** Milliseconds until `tokens` would fit (0 when they do; Infinity when the request can never fit). */
  waitFor(id: string, tokens: number): number;
  /** Counts an in-flight request against the model at once, so concurrent requests do not all pick the same model. */
  reserve(id: string, tokens: number): Reservation;
  observe(id: string, o: Observation): void;
};

export function createTokenBudget(o: TokenBudgetOptions = {}): TokenBudget {
  const now = o.now ?? Date.now;
  const states = new Map<string, State>();
  const tracks = o.tracks ?? (() => true);
  const stateOf = (id: string): State => {
    const existing = states.get(id);
    if (existing) return existing;
    const created: State = { entries: [] };
    states.set(id, created);
    return created;
  };
  const tracked = (id: string): boolean => tracks(id) && limit(id) > 0;
  const limit = (id: string): number => states.get(id)?.limit ?? o.limits?.[id] ?? o.defaultLimit ?? 0;

  function prune(s: State, at: number): void {
    s.entries = s.entries.filter((e) => e.pending || at - e.at < WINDOW_MS);
    if (s.snapshot && at - s.snapshot.at >= WINDOW_MS) s.snapshot = undefined;
  }

  /** Free tokens as the provider last reported them, refilled linearly since, minus what was started after that. */
  function fromSnapshot(s: State, id: string, at: number): number {
    const snap = s.snapshot as Snapshot;
    const refilled = ((at - snap.at) / WINDOW_MS) * limit(id);
    const since = s.entries.filter((e) => e.pending || e.at > snap.at).reduce((n, e) => n + e.tokens, 0);
    return Math.min(limit(id), snap.remaining + refilled) - since;
  }

  function headroom(id: string): number {
    if (!tracked(id)) return Number.POSITIVE_INFINITY;
    const s = stateOf(id);
    const at = now();
    prune(s, at);
    if (s.snapshot) return fromSnapshot(s, id, at);
    return limit(id) - s.entries.reduce((n, e) => n + e.tokens, 0);
  }

  function waitFor(id: string, tokens: number): number {
    if (!tracked(id)) return 0;
    const need = tokens + limit(id) * SAFETY_MARGIN;
    if (need > limit(id)) return Number.POSITIVE_INFINITY;
    const have = headroom(id);
    if (have >= need) return 0;
    const s = stateOf(id);
    const at = now();
    if (s.snapshot) return Math.ceil(((need - have) / limit(id)) * WINDOW_MS);
    // Sliding window: the oldest requests leave first.
    let free = have;
    for (const e of [...s.entries].filter((x) => !x.pending).sort((a, b) => a.at - b.at)) {
      free += e.tokens;
      if (free >= need) return Math.max(e.at + WINDOW_MS - at, 0) + 1;
    }
    return WINDOW_MS;
  }

  return {
    tracked,
    limit,
    headroom,
    fits: (id, tokens) => waitFor(id, tokens) === 0,
    waitFor,
    reserve(id, tokens) {
      if (!tracked(id)) return { settle() {} };
      const entry: Entry = { at: now(), tokens, pending: true };
      stateOf(id).entries.push(entry);
      return {
        settle(actual) {
          if (!entry.pending) return;
          entry.tokens = actual ?? entry.tokens;
          entry.pending = false;
        },
      };
    },
    observe(id, obs) {
      const s = stateOf(id);
      if (obs.limitTokens !== undefined && obs.limitTokens > 0) s.limit = obs.limitTokens;
      if (obs.remainingTokens !== undefined && tracks(id)) s.snapshot = { at: now(), remaining: Math.max(obs.remainingTokens, 0) };
      if (obs.tokens !== undefined && tracks(id)) {
        // The reply's own count replaces the estimate of the oldest request still in flight (or is logged on its own).
        const inFlight = s.entries.find((e) => e.pending);
        if (inFlight) {
          inFlight.tokens = obs.tokens;
          inFlight.pending = false;
        } else {
          s.entries.push({ at: now(), tokens: obs.tokens, pending: false });
        }
      }
    },
  };
}
