/**
 * Process-wide lazy singletons. They live on `globalThis` so every route bundle (and dev hot reloads)
 * shares one instance: caches, limiters and budgets only work when all requests see the same object.
 */

type Holder = Map<string, unknown>;
const HOLDER_KEY = "__tasteforgeSingletons";

function holder(): Holder {
  const g = globalThis as { [HOLDER_KEY]?: Holder };
  return (g[HOLDER_KEY] ??= new Map());
}

export function singleton<T>(key: string, create: () => T): T {
  const map = holder();
  if (!map.has(key)) map.set(key, create());
  return map.get(key) as T;
}

/** Forgets every singleton (tests only). */
export function resetSingletons(): void {
  holder().clear();
}
