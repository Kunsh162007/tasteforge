import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldWarmOnBoot, warmShowcaseOnBoot } from "./showcaseService";

afterEach(() => vi.useRealTimers());

describe("showcase boot warm-up", () => {
  it("runs for a production server on live data only, and can be switched off", () => {
    expect(shouldWarmOnBoot({ NODE_ENV: "production", QLOO_MODE: "live" })).toBe(true);
    expect(shouldWarmOnBoot({ NODE_ENV: "production", QLOO_MODE: "mock" })).toBe(false);
    expect(shouldWarmOnBoot({ NODE_ENV: "development", QLOO_MODE: "live" })).toBe(false);
    expect(shouldWarmOnBoot({ NODE_ENV: "production", QLOO_MODE: "live", SHOWCASE_WARM_ON_BOOT: "0" })).toBe(false);
  });

  it("starts the sequential generation shortly after boot", async () => {
    vi.useFakeTimers();
    const ensure = vi.fn(async () => {});
    expect(warmShowcaseOnBoot({ NODE_ENV: "production", QLOO_MODE: "live" }, () => ({ ensure }))).toBe(true);
    expect(ensure).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3_100);
    expect(ensure).toHaveBeenCalledTimes(1);
  });

  it("does nothing off live data, and logs instead of throwing when the service cannot start", async () => {
    vi.useFakeTimers();
    const ensure = vi.fn(async () => {});
    expect(warmShowcaseOnBoot({ NODE_ENV: "production", QLOO_MODE: "mock" }, () => ({ ensure }))).toBe(false);
    const log = vi.fn();
    warmShowcaseOnBoot({ NODE_ENV: "production", QLOO_MODE: "live" }, () => {
      throw new Error("no keys");
    }, log);
    await vi.advanceTimersByTimeAsync(3_100);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("no keys"));
    expect(ensure).not.toHaveBeenCalled();
  });
});
