import { QlooError } from "../errors";

export type Attempt<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string; readonly status?: number };

/** Runs a Qloo call and turns a thrown QlooError into data (messages never include request headers). */
export async function attempt<T>(fn: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    if (e instanceof QlooError) return { ok: false, message: e.message, status: e.status };
    return { ok: false, message: "unexpected error" };
  }
}

export const httpNote = (status: number | undefined): string => (status ? ` (HTTP ${status})` : "");

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Counts the `urn:tag:<type>` families in a list of tag ids, e.g. "genre x4, decor x2". */
export function tagFamilies(ids: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const family = id.split(":").slice(0, 3).join(":").replace(/^urn:tag:/, "") || "other";
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  return [...counts].map(([k, n]) => `${k} x${n}`).join(", ");
}
