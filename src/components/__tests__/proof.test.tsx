// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { EvidenceProvider } from "../EvidenceContext";
import { TasteProofPanel } from "../TasteProofPanel";
import { sampleProof } from "@/ui/fixtures/sampleBrief";

afterEach(cleanup);

describe("TasteProofPanel", () => {
  it("renders both columns with averages and the honest caption", () => {
    render(<TasteProofPanel proof={sampleProof} />);
    const plain = screen.getByRole("region", { name: "Plain LLM" });
    const forge = screen.getByRole("region", { name: "TasteForge" });
    expect(within(plain).getByText("0.31")).toBeTruthy();
    expect(within(forge).getByText("0.90")).toBeTruthy();
    expect(screen.getByText(/Affinity with this audience.s taste signals, scored by Qloo\./)).toBeTruthy();
  });

  it("exposes per-pick affinity as meters and marks unknown picks as not found", () => {
    render(<TasteProofPanel proof={sampleProof} />);
    const meter = screen.getByRole("meter", { name: "Affinity for Mitski" });
    expect(meter.getAttribute("aria-valuenow")).toBe("0.91");
    expect(screen.queryByRole("meter", { name: "Affinity for Harbor & Vine Bistro" })).toBeNull();
    expect(screen.getByText("Not found in Qloo")).toBeTruthy();
    expect(screen.getByText(/1 of 5 picks not found in Qloo/)).toBeTruthy();
  });

  it("leads with what the plain answer gets wrong before the fit comparison", () => {
    render(<TasteProofPanel proof={sampleProof} />);
    const checks = within(screen.getByRole("list", { name: "What the proof checks" })).getAllByRole("heading", { level: 3 });
    expect(checks.map((h) => h.textContent)).toEqual(["Picks Qloo couldn't find", "Real places in Brooklyn", "Audience fit"]);
    const missing = screen.getByText("Picks Qloo couldn't find").closest("li") as HTMLElement;
    expect(within(missing).getByText("1 of 5")).toBeTruthy();
    expect(within(missing).getByText("0 of 5")).toBeTruthy();
  });

  it("verifies TasteForge places locally and states the fit without claiming a multiple", () => {
    render(<TasteProofPanel proof={sampleProof} />);
    const local = screen.getByText("Real places in Brooklyn").closest("li") as HTMLElement;
    expect(within(local).getByText("2 of 2")).toBeTruthy();
    expect(screen.getByText("14 Court St Brooklyn")).toBeTruthy();
    expect(screen.queryByText(/closer to this audience|×/)).toBeNull();
    expect(screen.getByText(/TasteForge is at least as close/)).toBeTruthy();
  });

  it("admits when the plain answer scores higher on the picks it did find", () => {
    render(<TasteProofPanel proof={{ ...sampleProof, baselineAvg: 0.95 }} />);
    expect(screen.getByText(/plain answer scores a little higher/)).toBeTruthy();
  });

  it("offers a trace button per TasteForge pick that opens its evidence", async () => {
    const user = userEvent.setup();
    const opened: string[][] = [];
    render(
      <EvidenceProvider evidence={{ ev_1: { id: "ev_1", endpoint: "/v2/insights", params: {}, summary: "5 results; top: Mitski" } }}>
        <TasteProofPanel proof={sampleProof} />
      </EvidenceProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Trace: Mitski" }));
    opened.push([...document.querySelectorAll("[role=dialog]")].map((d) => d.textContent ?? ""));
    expect(opened[0].join(" ")).toContain("Mitski");
  });

  it("shows n/a, not 0.00, when none of a list's picks were found, and counts them separately", () => {
    const missing = sampleProof.baseline.map((p) => ({ ...p, affinity: null, qlooId: undefined }));
    render(<TasteProofPanel proof={{ ...sampleProof, baseline: missing, baselineAvg: null, baselineNotFound: missing.length }} />);
    const plain = screen.getByRole("region", { name: "Plain LLM" });
    expect(within(plain).getByText("n/a")).toBeTruthy();
    expect(within(plain).queryByText("0.00")).toBeNull();
    expect(within(plain).getByText(new RegExp(`${missing.length} of ${missing.length} picks not found in Qloo`))).toBeTruthy();
    expect(screen.getByText("n/a", { selector: ".check__num" })).toBeTruthy();
  });

  it("renders a busy placeholder while pending and nothing otherwise", () => {
    const { container, rerender } = render(<TasteProofPanel pending />);
    expect(screen.getByText(/Scoring a plain language-model answer/)).toBeTruthy();
    rerender(<TasteProofPanel />);
    expect(container.firstChild).toBeNull();
  });
});
