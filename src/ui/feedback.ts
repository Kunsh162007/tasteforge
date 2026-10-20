import { itemKey, itemRef, itemsAt, parseItemKey, SLOTS, type SlotPath } from "@/lib/agent/briefItems";
import type { Brief, Evidence } from "./contract";

/** Per-item review marks for the refine loop (docs/IMPLEMENTATION_PLAN.md section 8.5). Pure and immutable. */

export type Mark = "liked" | "disliked";

export type FeedbackState = {
  /** itemKey -> like or dislike (an item has at most one). */
  readonly marks: Readonly<Record<string, Mark>>;
  /** itemKey -> locked. A locked item stays verbatim, so it cannot be disliked. */
  readonly locked: Readonly<Record<string, true>>;
};

export const NO_FEEDBACK: FeedbackState = { marks: {}, locked: {} };

export type RefineFeedback = {
  liked: string[];
  disliked: string[];
  locked: string[];
};

export type FeedbackCounts = { liked: number; disliked: number; locked: number };

const without = <T extends Record<string, unknown>>(record: T, key: string): T => {
  const { [key]: _removed, ...rest } = record;
  void _removed;
  return rest as T;
};

/** Toggles a like or dislike; choosing the other one switches, choosing the same one clears. */
export function toggleMark(state: FeedbackState, key: string, mark: Mark): FeedbackState {
  if (state.marks[key] === mark) return { ...state, marks: without(state.marks, key) };
  // A disliked item will be replaced, so it cannot also be locked.
  const locked = mark === "disliked" ? without(state.locked, key) : state.locked;
  return { marks: { ...state.marks, [key]: mark }, locked };
}

/** Toggles the lock; locking an item clears a dislike on it. */
export function toggleLock(state: FeedbackState, key: string): FeedbackState {
  if (state.locked[key]) return { ...state, locked: without(state.locked, key) };
  const marks = state.marks[key] === "disliked" ? without(state.marks, key) : state.marks;
  return { marks, locked: { ...state.locked, [key]: true } };
}

/** Keeps only marks for items that still exist in the brief (after a refine, replaced items disappear). */
export function pruneFeedback(state: FeedbackState, brief: Brief): FeedbackState {
  const present = new Set(SLOTS.flatMap(({ path }) => itemsAt(brief, path).map((item) => itemKey(path, item))));
  const keep = <V>(record: Readonly<Record<string, V>>): Record<string, V> =>
    Object.fromEntries(Object.entries(record).filter(([key]) => present.has(key)));
  return { marks: keep(state.marks), locked: keep(state.locked) };
}

export function countFeedback(state: FeedbackState): FeedbackCounts {
  const marks = Object.values(state.marks);
  return {
    liked: marks.filter((m) => m === "liked").length,
    disliked: marks.filter((m) => m === "disliked").length,
    locked: Object.keys(state.locked).length,
  };
}

/** Request payload: liked and disliked as Qloo id (or label), locked as item keys. */
export function buildFeedback(state: FeedbackState): RefineFeedback {
  const refs = (mark: Mark): string[] => [
    ...new Set(Object.entries(state.marks).flatMap(([key, m]) => (m === mark ? [parseItemKey(key)?.ref ?? key] : []))),
  ];
  return { liked: refs("liked"), disliked: refs("disliked"), locked: Object.keys(state.locked) };
}

export const canRefine = (state: FeedbackState): boolean => {
  const { liked, disliked } = countFeedback(state);
  return liked + disliked > 0;
};

/** The signatures that belong to `evidence`, picked from the full map the server issued. */
export function signaturesFor(all: Readonly<Record<string, string>> | undefined, evidence: readonly Evidence[]): Record<string, string> {
  return Object.fromEntries(evidence.flatMap((e) => (all && Object.hasOwn(all, e.id) ? [[e.id, all[e.id]]] : [])));
}

/** The evidence records a brief cites (what a refine request needs; keeps the body small). */
export function citedEvidence(brief: Brief, evidence: Readonly<Record<string, Evidence>>): Evidence[] {
  const ids = new Set<string>([
    ...SLOTS.flatMap(({ path }) => itemsAt(brief, path).flatMap((item) => item.evidence)),
    ...(brief.audienceProfile.demographics ?? []).flatMap((d) => d.evidence),
    ...brief.messaging.evidence,
  ]);
  return [...ids].flatMap((id) => (evidence[id] ? [evidence[id]] : []));
}

export { itemKey, itemRef };
export type { SlotPath };
