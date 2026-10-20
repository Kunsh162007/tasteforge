// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeShare } from "@/lib/share/codec";
import { demoRunState } from "@/ui/demoState";
import { sharePayloadFromRun } from "@/ui/share";
import { SharedBrief } from "../SharedBrief";
import { ShareVerification } from "../ShareVerification";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

describe("ShareVerification banner", () => {
  it.each([
    ["checking", /checking/i],
    ["verified", /verified ✓/],
    ["unverified", /unverified/],
  ] as const)("shows the %s state", (status, title) => {
    render(<ShareVerification status={status} />);
    expect(screen.getByRole("status", { name: "Link verification" }).textContent).toMatch(title);
  });
});

describe("SharedBrief verification", () => {
  const payload = sharePayloadFromRun({
    ...demoRunState,
    signatures: { records: {}, shared: Object.fromEntries(demoRunState.brief ? Object.keys(demoRunState.evidence).map((id) => [id, `sig-${id}`]) : []) },
  });

  function open(verified: boolean) {
    if (!payload) throw new Error("no payload");
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ verified }) }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    window.location.hash = `#${encodeShare(payload)}`;
    render(<SharedBrief />);
    return fetchMock;
  }

  it("shows verified once the server vouches for the evidence", async () => {
    const fetchMock = open(true);
    await waitFor(() => expect(screen.getByRole("status", { name: "Link verification" }).textContent).toMatch(/verified ✓/));
    expect(fetchMock).toHaveBeenCalledWith("/api/verify", expect.objectContaining({ method: "POST" }));
  });

  it("shows unverified when the server does not", async () => {
    open(false);
    await waitFor(() => expect(screen.getByRole("status", { name: "Link verification" }).textContent).toMatch(/unverified/));
  });
});
