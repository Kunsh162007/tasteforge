import { describe, expect, it } from "vitest";
import { createCache } from "./cache";

describe("createCache", () => {
  it("returns undefined on miss and stored value on hit", () => {
    const c = createCache<{ n: number }>({ maxEntries: 2, ttlMs: 1000 });
    expect(c.get("a")).toBeUndefined();
    c.set("a", { n: 1 });
    expect(c.get("a")).toEqual({ n: 1 });
  });

  it("returns copies so callers cannot mutate cached data", () => {
    const c = createCache<{ n: number }>({ maxEntries: 2, ttlMs: 1000 });
    const v = { n: 1 };
    c.set("a", v);
    v.n = 99;
    const got = c.get("a") as { n: number };
    got.n = 42;
    expect(c.get("a")).toEqual({ n: 1 });
  });

  it("expires entries after the TTL", () => {
    let t = 0;
    const c = createCache<string>({ maxEntries: 2, ttlMs: 100, now: () => t });
    c.set("a", "x");
    t = 99;
    expect(c.get("a")).toBe("x");
    t = 100;
    expect(c.get("a")).toBeUndefined();
    expect(c.size()).toBe(0);
  });

  it("evicts the least recently used entry", () => {
    const c = createCache<string>({ maxEntries: 2, ttlMs: 1000 });
    c.set("a", "1");
    c.set("b", "2");
    c.get("a"); // a is now most recent
    c.set("c", "3");
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe("1");
    expect(c.get("c")).toBe("3");
  });

  it("overwrites an existing key without growing", () => {
    const c = createCache<string>({ maxEntries: 2, ttlMs: 1000 });
    c.set("a", "1");
    c.set("a", "2");
    expect(c.size()).toBe(1);
    expect(c.get("a")).toBe("2");
    c.clear();
    expect(c.size()).toBe(0);
  });

  it("rejects invalid options", () => {
    expect(() => createCache({ maxEntries: 0, ttlMs: 10 })).toThrow();
    expect(() => createCache({ maxEntries: 1, ttlMs: 0 })).toThrow();
  });
});
