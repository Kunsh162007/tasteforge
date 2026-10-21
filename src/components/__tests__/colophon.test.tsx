// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Colophon } from "../Colophon";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const health = (mode: string) => vi.fn(async () => ({ json: async () => ({ qloo: { mode } }) }) as unknown as Response);

describe("Colophon", () => {
  it("says the data is live, not synthetic, when the server runs on live Qloo", async () => {
    vi.stubGlobal("fetch", health("live"));
    render(<Colophon />);
    await waitFor(() => expect(screen.getByText(/come live from Qloo/)).toBeTruthy());
    expect(screen.queryByText(/synthetic/i)).toBeNull();
  });

  it("says the data is synthetic only in mock mode", async () => {
    vi.stubGlobal("fetch", health("mock"));
    render(<Colophon />);
    await waitFor(() => expect(screen.getByText(/synthetic sample data/)).toBeTruthy());
  });

  it("makes no claim about the data source before the server answers or when it cannot", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    render(<Colophon />);
    expect(screen.getByText(/A language model writes the names, captions and copy lines/)).toBeTruthy();
    expect(screen.queryByText(/synthetic/i)).toBeNull();
  });
});
