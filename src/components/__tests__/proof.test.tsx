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
    expect(screen.getByText("Not in Qloo's data for Brooklyn")).toBeTruthy();
    expect(screen.getByText(/1 of 5 picks couldn't be verified in Qloo/)).toBeTruthy();
  });

  it("leads with what the plain answer gets wrong before the fit comparison", () => {
    render(<TasteProofPanel proof={sampleProof} />);
    const checks = within(screen.getByRole("list", { name: "What the proof checks" })).getAllByRole("heading", { level: 3 });
    expect(checks.map((h) => h.textContent)).toEqual(["Picks Qloo couldn't verify", "Real places in Brooklyn", "Sanity check: audience fit"]);
    const missing = screen.getByText("Picks Qloo couldn't verify").closest("li") as HTMLElement;
    expect(within(missing).getByText("1 of 5")).toBeTruthy();
    expect(within(missing).getByText("0 of 5")).toBeTruthy();
  });

  it("verifies TasteForge places locally and states the fit without claiming a multiple", () => {
    render(<TasteProofPanel proof={sampleProof} />);
    const local = screen.getByText("Real places in Brooklyn").closest("li") as HTMLElement;
    expect(within(local).getByText("2 of 2")).toBeTruthy();
    expect(screen.getByText("14 Court St Brooklyn")).toBeTruthy();
    expect(screen.queryByText(/closer to this audience|×/)).toBeNull();
    expect(screen.queryByText(/at least as close|never lower/)).toBeNull();
    expect(screen.getByText(/Qloo normalizes affinity within each query/)).toBeTruthy();
  });

  it("makes no claim about which list fits better, whichever scores higher", () => {
    render(<TasteProofPanel proof={{ ...sampleProof, baselineAvg: 0.95 }} />);
    expect(screen.queryByText(/scores a little higher|at least as close/)).toBeNull();
  });

  it("never says picks are invented", () => {
    const { container } = render(<TasteProofPanel proof={sampleProof} />);
    expect(container.textContent).not.toMatch(/invented/i);
  });

  it("labels wrong-type and other-city picks instead of calling them not found", () => {
    const proof = {
      ...sampleProof,
      baseline: [
        { name: "Arundhati Roy", kind: "artist" as const, affinity: null, status: "wrong_type" as const, matchedKind: "author" },
        { name: "Kilo Vintage", kind: "place" as const, affinity: 0.4, qlooId: "x", status: "other_city" as const },
        { name: "Amoeba", kind: "place" as const, affinity: null, status: "unverified" as const },
        { name: "Chaayos", kind: "place" as const, affinity: 0.7, status: "verified" as const },
      ],
      baselineNotFound: 3,
    };
    render(<TasteProofPanel proof={proof} />);
    expect(screen.getByText("Wrong type: Qloo lists a author")).toBeTruthy();
    expect(screen.getAllByText("In Qloo, but not in Brooklyn").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1 not in Qloo's data for Brooklyn, 1 listed under another type and 1 only in another city/).length).toBeGreaterThan(0);
    expect(screen.getByText(/3 of its 4 picks that Qloo couldn't verify in Brooklyn/)).toBeTruthy();
  });

  it("offers a trace button per TasteForge pick that opens its evidence", async () => {
    const user = userEvent.setup();
    const opened: string[][] = [];
    render(
      <EvidenceProvider evidence={{ ev_1: { id: "ev_1", endpoint: "/v2/insights", params: {}, summary: "5 results; top: Mitski" } }}>
        <TasteProofPanel proof={sampleProof} />
      </EvidenceProvider>,
    );
    await user.click(screen.getByRole("button", { name: /^trace .*: Mitski$/ }));
    opened.push([...document.querySelectorAll("[role=dialog]")].map((d) => d.textContent ?? ""));
    expect(opened[0].join(" ")).toContain("Mitski");
  });

  it("shows n/a, not 0.00, when none of a list's picks were found, and counts them separately", () => {
    const missing = sampleProof.baseline.map((p) => ({ ...p, affinity: null, qlooId: undefined }));
    render(<TasteProofPanel proof={{ ...sampleProof, baseline: missing, baselineAvg: null, baselineNotFound: missing.length }} />);
    const plain = screen.getByRole("region", { name: "Plain LLM" });
    expect(within(plain).getByText("n/a")).toBeTruthy();
    expect(within(plain).queryByText("0.00")).toBeNull();
    expect(within(plain).getByText(new RegExp(`${missing.length} of ${missing.length} picks couldn't be verified in Qloo`))).toBeTruthy();
    expect(screen.getByText("n/a", { selector: ".check__num" })).toBeTruthy();
  });

  it("renders a busy placeholder while pending and nothing otherwise", () => {
    const { container, rerender } = render(<TasteProofPanel pending />);
    expect(screen.getByText(/Scoring a plain language-model answer/)).toBeTruthy();
    rerender(<TasteProofPanel />);
    expect(container.firstChild).toBeNull();
  });
});

describe("TasteProofPanel verdict", () => {
  it("opens with one plain sentence and a legend, and gives each check a plain-language question", () => {
    render(<TasteProofPanel proof={sampleProof} />);
    expect(screen.getByText(/A plain AI answer named 1 of its 5 picks that Qloo couldn't verify in Brooklyn/)).toBeTruthy();
    expect(screen.getByText("Does Qloo's data have each name, as the right type, in the right city?")).toBeTruthy();
    expect(document.getElementById("proof")).not.toBeNull();
  });

  it("does not claim a miss when every plain pick was found", () => {
    const found = sampleProof.baseline.map((p) => ({ ...p, affinity: p.affinity ?? 0.2 }));
    render(<TasteProofPanel proof={{ ...sampleProof, baseline: found, baselineNotFound: 0 }} />);
    expect(screen.getByText(/every name was verified/)).toBeTruthy();
  });
});
